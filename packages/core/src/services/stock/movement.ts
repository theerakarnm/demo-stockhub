/**
 * Turns a business event into stock movements. Still pure - it returns the rows
 * to write, it does not write them. packages/db owns persistence, inside one
 * transaction with the lots locked.
 */

import { type MovementReason, isInbound } from '../../domain/enums';
import type { ChannelId, OrderId, StockLotId, VariantId, WarehouseId } from '../../domain/ids';
import { type Satang, mulMoney } from '../../domain/money';
import { StockHubError } from '../../errors';
import { type LotConsumption, type StockLot, consumeFifo, restoreFifo } from '../costing/fifo';

export interface MovementRequestLine {
  variantId: VariantId;
  /** Always positive; the movement reason decides the sign. */
  qty: number;
  /** Selling price, needed for margin. Omit for pure stock adjustments. */
  unitPrice?: Satang;
  /**
   * Cost of ONE unit, required for inbound movements that open a new FIFO lot
   * (purchase_in, adjust_in, transfer_in without a restore).
   */
  unitCost?: Satang;
  /**
   * The ORIGINAL sale slices, required for return_in / cancel_restore so the
   * movement re-credits the exact cost the sale consumed, not today's cost.
   */
  restore?: readonly LotConsumption[];
}

export interface MovementRequest {
  reason: MovementReason;
  warehouseId: WarehouseId;
  channelId?: ChannelId;
  orderId?: OrderId;
  occurredAt: Date;
  lines: readonly MovementRequestLine[];
  note?: string;
  /**
   * What to do when an outbound line finds fewer lots than the qty asked for.
   * Defaults to 'error' (POS bills); marketplace imports use 'shortfall'.
   */
  shortagePolicy?: 'error' | 'shortfall';
}

/** One row to insert into stock_movements, plus the lot deltas it implies. */
export interface PlannedMovement {
  variantId: VariantId;
  warehouseId: WarehouseId;
  reason: MovementReason;
  /** Positive for inbound, negative for outbound. */
  qtyDelta: number;
  /** COGS for outbound, lot value for inbound. */
  costTotal: Satang;
  consumption: LotConsumption[];
  /** Set for inbound movements that open a new FIFO layer. */
  newLot?: { unitCost: Satang; qty: number; receivedAt: Date };
  /** Set for inbound movements that top an existing layer back up. */
  lotRestores?: { lotId: StockLotId; qty: number }[];
  /** Business time of the movement, copied from the request. */
  occurredAt: Date;
  /** Units the request asked for but no lot could cover (outbound only). */
  shortfallQty: number;
}

export interface PlanContext {
  /** Open lots per variant, oldest first, already locked by the caller. */
  lotsByVariant: ReadonlyMap<VariantId, readonly StockLot[]>;
}

export const planMovements = (request: MovementRequest, ctx: PlanContext): PlannedMovement[] => {
  const inbound = isInbound(request.reason);
  return request.lines.map((line): PlannedMovement => {
    // The sign convention lives on the reason, not on the caller-supplied qty,
    // so a negative qty in an export file can never flip a sale into a restock.
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new StockHubError('validation_error', 'Movement quantity must be a positive integer', {
        variantId: line.variantId,
        qty: line.qty,
      });
    }
    const base = {
      variantId: line.variantId,
      warehouseId: request.warehouseId,
      reason: request.reason,
      occurredAt: request.occurredAt,
    };
    if (!inbound) {
      const lots = ctx.lotsByVariant.get(line.variantId) ?? [];
      const result = consumeFifo(lots, line.qty, { onShortage: request.shortagePolicy ?? 'error' });
      const consumedQty = line.qty - result.shortfallQty;
      return {
        ...base,
        qtyDelta: -consumedQty,
        costTotal: result.totalCost,
        consumption: result.consumed,
        shortfallQty: result.shortfallQty,
      };
    }
    if (line.restore) {
      const back = restoreFifo(line.restore, line.qty);
      return {
        ...base,
        qtyDelta: line.qty,
        costTotal: back.totalCost,
        consumption: back.restored,
        lotRestores: back.restored.map((slice) => ({ lotId: slice.lotId, qty: slice.qty })),
        shortfallQty: 0,
      };
    }
    if (line.unitCost === undefined) {
      throw new StockHubError(
        'validation_error',
        'An inbound movement needs a unit cost to open a FIFO lot',
        { variantId: line.variantId, reason: request.reason },
      );
    }
    return {
      ...base,
      qtyDelta: line.qty,
      costTotal: mulMoney(line.unitCost, line.qty),
      consumption: [],
      newLot: { unitCost: line.unitCost, qty: line.qty, receivedAt: request.occurredAt },
      shortfallQty: 0,
    };
  });
};
