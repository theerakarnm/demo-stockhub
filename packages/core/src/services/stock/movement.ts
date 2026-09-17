/**
 * Turns a business event into stock movements. Still pure - it returns the rows
 * to write, it does not write them. packages/db owns persistence.
 *
 * TODO(template): implement planMovements. The shape below is the contract the
 * API routes already assume.
 */

import type { MovementReason } from '../../domain/enums';
import type { ChannelId, OrderId, StockLotId, VariantId, WarehouseId } from '../../domain/ids';
import type { Satang } from '../../domain/money';
import { NotImplementedError } from '../../errors';
import type { LotConsumption, StockLot } from '../costing/fifo';

export interface MovementRequestLine {
  variantId: VariantId;
  qty: number;
  /** Selling price, needed for margin. Omit for pure stock adjustments. */
  unitPrice?: Satang;
}

export interface MovementRequest {
  reason: MovementReason;
  warehouseId: WarehouseId;
  channelId?: ChannelId;
  orderId?: OrderId;
  occurredAt: Date;
  lines: readonly MovementRequestLine[];
  note?: string;
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
}

export interface PlanContext {
  /** Open lots per variant, oldest first, already locked by the caller. */
  lotsByVariant: ReadonlyMap<VariantId, readonly StockLot[]>;
}

export const planMovements = (_request: MovementRequest, _ctx: PlanContext): PlannedMovement[] => {
  throw new NotImplementedError('planMovements');
};
