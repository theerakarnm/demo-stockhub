/**
 * The stock ledger: write movements, read history.
 *
 * `stock_movements` is append only. Correcting a mistake means writing a new
 * movement with the opposite sign, never editing or deleting a row. That rule
 * is what lets the movement history screen double as an audit log.
 */

import {
  type LotConsumption,
  type MovementReason,
  type OrgId,
  type PlannedMovement,
  type UserId,
  type VariantId,
  asStockLotId,
  satang,
} from '@stockhub/core';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { movementLotConsumptions, products, stockLots, stockMovements, variants } from '../schema';
import { applyLotDeltas } from './inventory-repo';

export interface RecordMovementsInput {
  orgId: OrgId;
  planned: readonly PlannedMovement[];
  createdBy?: UserId;
  orderId?: string;
  channelId?: string;
  note?: string;
}

export interface RecordedMovement {
  movementId: string;
  variantId: VariantId;
  qtyDelta: number;
  costTotal: number;
}

/**
 * Persist what `planMovements` decided. MUST run inside a transaction.
 *
 * One planned movement becomes: the ledger row, plus its consumption rows and
 * lot deltas (outbound), the new FIFO layer it opens (inbound), or the
 * restored layers (return / cancel). Everything runs on the caller's `exec`,
 * so the whole write is one atomic unit under the lot locks taken in
 * getOpenLotsForUpdate().
 *
 * Planned rows with `qtyDelta === 0` (a full shortfall) are skipped: the
 * database rejects zero-qty movements, and nothing physically moved anyway -
 * the shortfall is reported by the planner, not written into the ledger.
 */
export const recordMovements = async (
  exec: DbExecutor,
  input: RecordMovementsInput & { reference?: string },
): Promise<RecordedMovement[]> => {
  const out: RecordedMovement[] = [];
  for (const plan of input.planned) {
    if (plan.qtyDelta === 0) continue; // full shortfall: nothing physically moved
    const [movement] = await exec
      .insert(stockMovements)
      .values({
        orgId: input.orgId,
        variantId: plan.variantId,
        warehouseId: plan.warehouseId,
        reason: plan.reason,
        qtyDelta: plan.qtyDelta,
        costTotal: plan.costTotal,
        channelId: input.channelId,
        orderId: input.orderId,
        occurredAt: plan.occurredAt,
        note: input.note,
        createdBy: input.createdBy,
      })
      .returning({ id: stockMovements.id });
    if (!movement) throw new Error('Insert into stock_movements returned no row');
    if (plan.qtyDelta < 0 && plan.consumption.length > 0) {
      await exec.insert(movementLotConsumptions).values(
        plan.consumption.map((slice) => ({
          orgId: input.orgId,
          movementId: movement.id,
          lotId: slice.lotId,
          qty: slice.qty,
          unitCost: slice.unitCost,
          lineCost: slice.lineCost,
        })),
      );
      await applyLotDeltas(
        exec,
        plan.consumption.map((slice) => ({ lotId: slice.lotId, qty: slice.qty })),
      );
    }
    if (plan.newLot) {
      await exec.insert(stockLots).values({
        orgId: input.orgId,
        variantId: plan.variantId,
        warehouseId: plan.warehouseId,
        qty: plan.newLot.qty,
        remainingQty: plan.newLot.qty,
        unitCost: plan.newLot.unitCost,
        receivedAt: plan.newLot.receivedAt,
        sourceMovementId: movement.id,
        reference: input.reference,
      });
    }
    if (plan.lotRestores) {
      await applyLotDeltas(
        exec,
        plan.lotRestores.map((restore) => ({ lotId: restore.lotId, qty: -restore.qty })),
      );
    }
    out.push({
      movementId: movement.id,
      variantId: plan.variantId,
      qtyDelta: plan.qtyDelta,
      costTotal: plan.costTotal,
    });
  }
  return out;
};

export interface HistoryQuery {
  orgId: OrgId;
  variantId?: VariantId;
  reason?: MovementReason;
  from?: Date;
  to?: Date;
  /** Keyset cursor: the last row the caller already served, so pages never
   *  repeat or skip a movement when two share an occurred_at. Replaces offset. */
  before?: { at: Date; id: string };
  limit?: number;
}

export interface HistoryRow {
  id: string;
  occurredAt: Date;
  reason: MovementReason;
  qtyDelta: number;
  /** Cost data. Strip it for roles without 'cost:read'. */
  costTotal: number;
  variantId: string;
  sku: string;
  productName: string;
  note: string | null;
  orderId: string | null;
  channelId: string | null;
  /** Running balance of the variant right after this movement, computed as
   *  sum(qty_delta) over the whole ledger of that variant. */
  qtyAfter: number;
  /** Where the stock physically moved. */
  warehouseId: string;
  /** Who recorded the row, when the actor is known. */
  createdBy: string | null;
}

/**
 * Movement history, newest first. Backed by the
 * stock_movements_variant_occurred_idx / _org_occurred_idx indexes.
 *
 * The running balance must be summed over EVERY movement of the variant, so
 * the inner select filters only by orgId (+ variantId) and the reason / date
 * / cursor filters run on the outer select, after the window function has
 * done its work. Filtering inside the window would silently restart the
 * balance at the first filtered page.
 *
 * Pages are keyset pages: `before` is the last row the caller already served,
 * compared as the (occurred_at, id) tuple, so a movement written between two
 * page requests can never shift rows across the border. `offset` would
 * re-read and re-skip rows on every such write, so it has no place in an
 * append-only ledger.
 *
 * Keep the page size bounded: this table grows forever.
 */
export const listHistory = async (exec: DbExecutor, query: HistoryQuery): Promise<HistoryRow[]> => {
  const balances = exec
    .select({
      id: stockMovements.id,
      variantId: stockMovements.variantId,
      warehouseId: stockMovements.warehouseId,
      reason: stockMovements.reason,
      qtyDelta: stockMovements.qtyDelta,
      costTotal: stockMovements.costTotal,
      channelId: stockMovements.channelId,
      orderId: stockMovements.orderId,
      occurredAt: stockMovements.occurredAt,
      note: stockMovements.note,
      createdBy: stockMovements.createdBy,
      qtyAfter:
        sql<number>`sum(${stockMovements.qtyDelta}) over (partition by ${stockMovements.variantId} order by ${stockMovements.occurredAt}, ${stockMovements.id})::int`.as(
          'qty_after',
        ),
    })
    .from(stockMovements)
    .where(
      query.variantId
        ? and(eq(stockMovements.orgId, query.orgId), eq(stockMovements.variantId, query.variantId))
        : eq(stockMovements.orgId, query.orgId),
    )
    .as('m');

  return exec
    .select({
      id: balances.id,
      occurredAt: balances.occurredAt,
      reason: balances.reason,
      qtyDelta: balances.qtyDelta,
      costTotal: balances.costTotal,
      variantId: balances.variantId,
      sku: variants.sku,
      productName: products.name,
      note: balances.note,
      orderId: balances.orderId,
      channelId: balances.channelId,
      qtyAfter: balances.qtyAfter,
      warehouseId: balances.warehouseId,
      createdBy: balances.createdBy,
    })
    .from(balances)
    .innerJoin(variants, eq(variants.id, balances.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(
      and(
        query.reason ? eq(balances.reason, query.reason) : undefined,
        query.from ? gte(balances.occurredAt, query.from) : undefined,
        query.to ? lte(balances.occurredAt, query.to) : undefined,
        query.before
          ? // The raw template cannot bind a JS Date (postgres.js rejects it in
            // a row-value comparison), so the cursor point crosses as an ISO
            // string, which Postgres infers as timestamptz here.
            sql`(${balances.occurredAt}, ${balances.id}) < (${query.before.at.toISOString()}, ${query.before.id})`
          : undefined,
      ),
    )
    .orderBy(desc(balances.occurredAt), desc(balances.id))
    .limit(query.limit ?? 50);
};

/**
 * Deliberately omits `qtyAfter`: the running balance is a property of the
 * whole variant ledger (see listHistory), while this read path narrows to one
 * order, where a window sum would only be a meaningless partial balance. The
 * reversal flow needs the lot slices, not the balance.
 */
export type OrderMovementRow = Omit<HistoryRow, 'qtyAfter'> & { consumptions: LotConsumption[] };

/**
 * Every movement caused by one order, oldest first. Used when a marketplace
 * flips an order to cancelled or returned and we must reverse exactly what it
 * did: each row carries the original lot slices, so the caller can feed them
 * into restoreFifo() instead of guessing today's cost.
 */
export const listMovementsForOrder = async (
  exec: DbExecutor,
  params: { orgId: OrgId; orderId: string },
): Promise<OrderMovementRow[]> => {
  const rows = await exec
    .select({
      id: stockMovements.id,
      occurredAt: stockMovements.occurredAt,
      reason: stockMovements.reason,
      qtyDelta: stockMovements.qtyDelta,
      costTotal: stockMovements.costTotal,
      variantId: stockMovements.variantId,
      sku: variants.sku,
      productName: products.name,
      note: stockMovements.note,
      orderId: stockMovements.orderId,
      channelId: stockMovements.channelId,
      warehouseId: stockMovements.warehouseId,
      createdBy: stockMovements.createdBy,
    })
    .from(stockMovements)
    .innerJoin(variants, eq(variants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(stockMovements.orgId, params.orgId), eq(stockMovements.orderId, params.orderId)))
    .orderBy(asc(stockMovements.occurredAt), asc(stockMovements.id));
  if (rows.length === 0) return [];

  // One query for every slice of the order instead of one query per movement.
  // inArray rejects an empty list, hence the early return above.
  const slices = await exec
    .select({
      movementId: movementLotConsumptions.movementId,
      lotId: movementLotConsumptions.lotId,
      qty: movementLotConsumptions.qty,
      unitCost: movementLotConsumptions.unitCost,
      lineCost: movementLotConsumptions.lineCost,
    })
    .from(movementLotConsumptions)
    .where(
      and(
        eq(movementLotConsumptions.orgId, params.orgId),
        inArray(
          movementLotConsumptions.movementId,
          rows.map((row) => row.id),
        ),
      ),
    );

  const byMovement = new Map<string, LotConsumption[]>();
  for (const slice of slices) {
    const list = byMovement.get(slice.movementId) ?? [];
    list.push({
      lotId: asStockLotId(slice.lotId),
      qty: slice.qty,
      unitCost: satang(slice.unitCost),
      lineCost: satang(slice.lineCost),
    });
    byMovement.set(slice.movementId, list);
  }

  return rows.map((row) => ({ ...row, consumptions: byMovement.get(row.id) ?? [] }));
};
