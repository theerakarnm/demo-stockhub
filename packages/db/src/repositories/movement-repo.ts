/**
 * The stock ledger: write movements, read history.
 *
 * `stock_movements` is append only. Correcting a mistake means writing a new
 * movement with the opposite sign, never editing or deleting a row. That rule
 * is what lets the movement history screen double as an audit log.
 */

import {
  type MovementReason,
  NotImplementedError,
  type OrgId,
  type PlannedMovement,
  type UserId,
  type VariantId,
} from '@stockhub/core';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { products, stockMovements, variants } from '../schema';

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
 * TODO(template) implement, in this order:
 *   1. INSERT the stock_movements rows, RETURNING id
 *   2. for an outbound movement: INSERT one movement_lot_consumptions row per
 *      slice in `planned.consumption`, then applyLotDeltas() with the same
 *      slices so remaining_qty drops
 *   3. for an inbound movement carrying `newLot`: INSERT the stock_lots row
 *      with source_movement_id = the movement from step 1
 *   4. for an inbound movement carrying `lotRestores` (return / cancel):
 *      applyLotDeltas() with negative quantities so the original layers get
 *      their units and their cost back
 *
 * Do all of it with the same `exec` the caller passed in, so the whole thing is
 * one atomic unit with the lot locks taken in getOpenLotsForUpdate().
 */
export const recordMovements = async (
  _exec: DbExecutor,
  _input: RecordMovementsInput,
): Promise<RecordedMovement[]> => {
  throw new NotImplementedError('recordMovements');
};

export interface HistoryQuery {
  orgId: OrgId;
  variantId?: VariantId;
  reason?: MovementReason;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
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
}

/**
 * Movement history, newest first. Backed by the
 * stock_movements_variant_occurred_idx / _org_occurred_idx indexes.
 *
 * Keep the page size bounded: this table grows forever.
 */
export const listHistory = async (exec: DbExecutor, query: HistoryQuery): Promise<HistoryRow[]> => {
  const filters = [eq(stockMovements.orgId, query.orgId)];
  if (query.variantId) filters.push(eq(stockMovements.variantId, query.variantId));
  if (query.reason) filters.push(eq(stockMovements.reason, query.reason));
  if (query.from) filters.push(gte(stockMovements.occurredAt, query.from));
  if (query.to) filters.push(lte(stockMovements.occurredAt, query.to));

  return exec
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
    })
    .from(stockMovements)
    .innerJoin(variants, eq(variants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(...filters))
    .orderBy(desc(stockMovements.occurredAt), desc(stockMovements.id))
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0);
};

/**
 * Every movement caused by one order. Used when a marketplace flips an order to
 * cancelled or returned and we must reverse exactly what it did.
 *
 * TODO(template): join movement_lot_consumptions so the caller can feed the
 * original slices into restoreFifo() instead of guessing today's cost.
 */
export const listMovementsForOrder = async (
  _exec: DbExecutor,
  _params: { orgId: OrgId; orderId: string },
): Promise<HistoryRow[]> => {
  throw new NotImplementedError('listMovementsForOrder');
};
