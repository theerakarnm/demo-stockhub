/**
 * Stock reads and lot maintenance.
 *
 * Division of labour: this file only talks to Postgres. Every FIFO decision is
 * made by pure functions in @stockhub/core. The repository loads lots, hands
 * them to `consumeFifo`, then writes back exactly what the engine returned.
 */

import {
  type StockLot as DomainStockLot,
  type OrgId,
  StockHubError,
  type VariantId,
  type WarehouseId,
  asStockLotId,
  asVariantId,
  satang,
} from '@stockhub/core';
import { and, asc, eq, gt, gte, ilike, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { orderLines, orders, products, stockLots, variants, warehouses } from '../schema';
import type { Warehouse } from '../schema';

export interface LotQuery {
  orgId: OrgId;
  variantId: VariantId;
  warehouseId: WarehouseId;
}

/**
 * Load the open FIFO layers of one variant, oldest first, and LOCK them.
 *
 * `.for('update')` emits `SELECT ... FOR UPDATE`, which is the single most
 * important line in this package. Without it two concurrent imports read the
 * same `remaining_qty`, both subtract from it, and the shop silently oversells.
 *
 * It only takes effect inside a transaction, so callers MUST wrap it:
 *
 *   await db.transaction(async (tx) => {
 *     const lots = await getOpenLotsForUpdate(tx, query);
 *     const result = consumeFifo(lots, qty, { onShortage: 'shortfall' });
 *     await applyLotDeltas(tx, result.consumed);
 *     // ... insert the movement + its consumption rows here too
 *   });
 *
 * Ordering by (received_at, id) matches the tie-break rule documented in
 * core/services/costing/fifo.ts, so the SQL order and the engine order agree.
 */
export const getOpenLotsForUpdate = async (
  exec: DbExecutor,
  query: LotQuery,
): Promise<DomainStockLot[]> => {
  const rows = await exec
    .select()
    .from(stockLots)
    .where(
      and(
        eq(stockLots.orgId, query.orgId),
        eq(stockLots.variantId, query.variantId),
        eq(stockLots.warehouseId, query.warehouseId),
        gt(stockLots.remainingQty, 0),
      ),
    )
    .orderBy(asc(stockLots.receivedAt), asc(stockLots.id))
    .for('update');

  // Map the DB row onto the domain shape the FIFO engine expects.
  return rows.map((row) => ({
    id: asStockLotId(row.id),
    variantId: asVariantId(row.variantId),
    remainingQty: row.remainingQty,
    unitCost: satang(row.unitCost),
    receivedAt: row.receivedAt,
  }));
};

/** Read-only lot view for the variant detail screen. */
export interface OpenLotRow {
  id: string;
  variantId: VariantId;
  remainingQty: number;
  receivedQty: number;
  unitCost: number;
  receivedAt: Date;
  reference: string | null;
}

/**
 * The `getOpenLotsForUpdate` query without `.for('update')`: a read path must
 * never take row locks. It spans every warehouse because the detail screen
 * shows the variant's whole position, and it keeps `receivedQty` / `reference`,
 * which the locked FIFO query does not need but the UI renders next to the cost.
 */
export const listOpenLots = async (
  exec: DbExecutor,
  params: { orgId: OrgId; variantId: VariantId },
): Promise<OpenLotRow[]> => {
  const rows = await exec
    .select({
      id: stockLots.id,
      variantId: stockLots.variantId,
      remainingQty: stockLots.remainingQty,
      receivedQty: stockLots.qty,
      unitCost: stockLots.unitCost,
      receivedAt: stockLots.receivedAt,
      reference: stockLots.reference,
    })
    .from(stockLots)
    .where(
      and(
        eq(stockLots.orgId, params.orgId),
        eq(stockLots.variantId, params.variantId),
        gt(stockLots.remainingQty, 0),
      ),
    )
    .orderBy(asc(stockLots.receivedAt), asc(stockLots.id));
  return rows.map((row) => ({ ...row, variantId: asVariantId(row.variantId) }));
};

/** On-hand quantity per variant, derived from the open lots. */
export const getOnHandByVariant = async (
  exec: DbExecutor,
  params: { orgId: OrgId; warehouseId?: WarehouseId },
): Promise<Map<VariantId, number>> => {
  const rows = await exec
    .select({
      variantId: stockLots.variantId,
      onHand: sql<number>`coalesce(sum(${stockLots.remainingQty}), 0)::int`,
    })
    .from(stockLots)
    .where(
      params.warehouseId
        ? and(eq(stockLots.orgId, params.orgId), eq(stockLots.warehouseId, params.warehouseId))
        : eq(stockLots.orgId, params.orgId),
    )
    .groupBy(stockLots.variantId);

  return new Map(rows.map((row) => [asVariantId(row.variantId), Number(row.onHand)]));
};

export interface StockOverviewRow {
  variantId: VariantId;
  sku: string;
  productName: string;
  variantName: string | null;
  kind: 'simple' | 'bundle';
  unit: string;
  sellingPrice: number;
  onHand: number;
  reserved: number;
  reorderPoint: number;
  /** Cost fields. The API must call stripCost() before sending these to a
   *  role without the 'cost:read' permission. */
  stockValue: number;
  avgUnitCost: number;
}

/**
 * The main stock screen: one row per variant with quantity and value.
 *
 * The page is a keyset page, not an OFFSET page: `after` is the last row the
 * caller already served, compared as the (product name, variant id) tuple, so
 * an insert between pages can never shift a row across the page border.
 * `limit + 1` rows come back so the caller can tell whether a cursor follows.
 *
 * Bundles own no lots, so their `onHand` is 0 here; the service overlays
 * bundleAvailability(components, onHandByVariant) from @stockhub/core.
 */
export const getStockOverview = async (
  exec: DbExecutor,
  params: {
    orgId: OrgId;
    warehouseId?: WarehouseId;
    search?: string;
    after?: { name: string; id: string };
    limit: number;
  },
): Promise<StockOverviewRow[]> => {
  // Open FIFO layers only: a fully consumed lot must not feed qty or value.
  // Both aggregates come out of one pass over the lots.
  const lotTotals = exec
    .select({
      variantId: stockLots.variantId,
      onHand: sql<number>`sum(${stockLots.remainingQty})::int`.as('on_hand'),
      // bigint sums can arrive as strings depending on the driver, hence the
      // Number() mapping below instead of trusting the declared type.
      stockValue: sql<
        string | number
      >`sum(${stockLots.remainingQty} * ${stockLots.unitCost})::bigint`.as('stock_value'),
    })
    .from(stockLots)
    .where(
      params.warehouseId
        ? and(
            eq(stockLots.orgId, params.orgId),
            eq(stockLots.warehouseId, params.warehouseId),
            gt(stockLots.remainingQty, 0),
          )
        : and(eq(stockLots.orgId, params.orgId), gt(stockLots.remainingQty, 0)),
    )
    .groupBy(stockLots.variantId)
    .as('lot_totals');

  // Confirmed orders hold stock back for a customer even before sale_out runs.
  const reservedTotals = exec
    .select({
      variantId: orderLines.variantId,
      reserved: sql<number>`sum(${orderLines.qty})::int`.as('reserved'),
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(eq(orderLines.orgId, params.orgId), eq(orders.status, 'confirmed')))
    .groupBy(orderLines.variantId)
    .as('reserved_totals');

  const rows = await exec
    .select({
      variantId: variants.id,
      sku: variants.sku,
      productName: products.name,
      variantName: variants.name,
      kind: variants.kind,
      unit: variants.unit,
      sellingPrice: variants.sellingPrice,
      onHand: lotTotals.onHand,
      reserved: reservedTotals.reserved,
      reorderPoint: variants.reorderPoint,
      stockValue: lotTotals.stockValue,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .leftJoin(lotTotals, eq(lotTotals.variantId, variants.id))
    .leftJoin(reservedTotals, eq(reservedTotals.variantId, variants.id))
    .where(
      and(
        eq(variants.orgId, params.orgId),
        eq(variants.isActive, true),
        params.search
          ? or(
              ilike(variants.sku, `%${params.search}%`),
              ilike(products.name, `%${params.search}%`),
              ilike(variants.name, `%${params.search}%`),
            )
          : undefined,
        params.after
          ? sql`(${products.name}, ${variants.id}) > (${params.after.name}, ${params.after.id})`
          : undefined,
      ),
    )
    .orderBy(asc(products.name), asc(variants.id))
    .limit(params.limit + 1);

  return rows.map((row) => {
    const onHand = row.onHand ?? 0;
    const stockValue = Number(row.stockValue ?? 0);
    return {
      variantId: asVariantId(row.variantId),
      sku: row.sku,
      productName: row.productName,
      variantName: row.variantName,
      kind: row.kind,
      unit: row.unit,
      sellingPrice: row.sellingPrice,
      onHand,
      reserved: row.reserved ?? 0,
      reorderPoint: row.reorderPoint,
      stockValue,
      avgUnitCost: onHand === 0 ? 0 : Math.round(stockValue / onHand),
    };
  });
};

/**
 * Write the lot deltas produced by consumeFifo / restoreFifo.
 *
 * Every delta is one guarded UPDATE: the WHERE clause re-checks the quantity
 * the caller saw when it locked the lot, so a lost lock can only abort the
 * transaction, never drive `remaining_qty` below 0 or above the received qty.
 * A 0-row UPDATE throws `conflict` because somebody consumed the lot between
 * the SELECT FOR UPDATE and this write.
 *
 * Pass a negative `qty` to restore (return / cancel).
 */
export const applyLotDeltas = async (
  exec: DbExecutor,
  deltas: readonly { lotId: string; qty: number }[],
): Promise<void> => {
  for (const delta of deltas) {
    if (delta.qty === 0) continue;
    // consuming: enough left; restoring: never above what was received
    const guard =
      delta.qty > 0
        ? gte(stockLots.remainingQty, delta.qty)
        : sql`${stockLots.remainingQty} - ${delta.qty} <= ${stockLots.qty}`;
    const updated = await exec
      .update(stockLots)
      .set({ remainingQty: sql`${stockLots.remainingQty} - ${delta.qty}` })
      .where(and(eq(stockLots.id, delta.lotId), guard))
      .returning({ id: stockLots.id });
    if (updated.length === 0) {
      throw new StockHubError('conflict', `Lot ${delta.lotId} changed between lock and write`, {
        lotId: delta.lotId,
        qty: delta.qty,
      });
    }
  }
};

/**
 * The warehouse marketplace imports feed when the caller did not pick one.
 * Exactly one warehouse per org carries `is_default`; if the org has none the
 * caller cannot proceed, so this throws `not_found` instead of returning null.
 */
export const getDefaultWarehouse = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<Warehouse> => {
  const [row] = await exec
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.orgId, params.orgId), eq(warehouses.isDefault, true)))
    .limit(1);
  if (!row) {
    throw new StockHubError('not_found', `Org ${params.orgId} has no default warehouse`, {
      orgId: params.orgId,
    });
  }
  return row;
};
