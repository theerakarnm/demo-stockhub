/**
 * Stock reads and lot maintenance.
 *
 * Division of labour: this file only talks to Postgres. Every FIFO decision is
 * made by pure functions in @stockhub/core. The repository loads lots, hands
 * them to `consumeFifo`, then writes back exactly what the engine returned.
 */

import {
  type StockLot as DomainStockLot,
  NotImplementedError,
  type OrgId,
  type VariantId,
  type WarehouseId,
  asStockLotId,
  asVariantId,
  satang,
} from '@stockhub/core';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { stockLots } from '../schema';

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
  unit: string;
  onHand: number;
  reorderPoint: number;
  /** Cost fields. The API must call stripCost() before sending these to a
   *  role without the 'cost:read' permission. */
  stockValue: number;
  avgUnitCost: number;
}

/**
 * The main stock screen: one row per variant with quantity and value.
 *
 * TODO(template) implement:
 *   SELECT v.id, v.sku, p.name, v.name, v.unit, v.reorder_point,
 *          coalesce(sum(l.remaining_qty), 0)                   AS on_hand,
 *          coalesce(sum(l.remaining_qty * l.unit_cost), 0)     AS stock_value
 *     FROM variants v
 *     JOIN products p ON p.id = v.product_id
 *     LEFT JOIN stock_lots l
 *       ON l.variant_id = v.id
 *      AND l.remaining_qty > 0
 *      AND (:warehouseId IS NULL OR l.warehouse_id = :warehouseId)
 *    WHERE v.org_id = :orgId AND v.is_active
 *    GROUP BY v.id, p.name
 *    ORDER BY p.name
 *   avg_unit_cost = stock_value / nullif(on_hand, 0)
 *
 * Bundles need a second pass: they own no lots, so their `onHand` is
 * bundleAvailability(components, onHandByVariant) from @stockhub/core.
 */
export const getStockOverview = async (
  _exec: DbExecutor,
  _params: { orgId: OrgId; warehouseId?: WarehouseId; search?: string },
): Promise<StockOverviewRow[]> => {
  throw new NotImplementedError('getStockOverview');
};

/**
 * Write the lot deltas produced by consumeFifo / restoreFifo.
 *
 * TODO(template) implement as one UPDATE per lot inside the caller's
 * transaction:
 *   UPDATE stock_lots
 *      SET remaining_qty = remaining_qty - :qty, updated_at = now()
 *    WHERE id = :lotId AND remaining_qty >= :qty
 * Check the affected row count. A 0 there means somebody consumed the lot
 * between the SELECT FOR UPDATE and this write, which must abort the
 * transaction instead of producing a negative quantity.
 *
 * Pass a negative `qty` to restore (return / cancel).
 */
export const applyLotDeltas = async (
  _exec: DbExecutor,
  _deltas: readonly { lotId: string; qty: number }[],
): Promise<void> => {
  throw new NotImplementedError('applyLotDeltas');
};
