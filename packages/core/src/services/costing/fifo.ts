/**
 * FIFO costing engine - pure functions over lot arrays.
 *
 * Why pure: the engine is the part the customer will question hardest during
 * the demo ("why is my COGS 1,240 baht?"). Pure functions let you answer with a
 * unit test instead of a database dump.
 *
 * The DB layer loads open lots, calls `consumeFifo`, then writes the resulting
 * lot deltas and the COGS number inside ONE transaction with `SELECT ... FOR
 * UPDATE` on the lot rows. Never compute FIFO outside a transaction.
 *
 * TODO(template): implement consumeFifo + restoreFifo and delete the throws.
 * Tests live in ./fifo.test.ts and already describe the expected behaviour.
 */

import type { StockLotId, VariantId } from '../../domain/ids';
import type { Satang } from '../../domain/money';
import { NotImplementedError } from '../../errors';

/** One purchase layer. Sorted oldest first by (receivedAt, id). */
export interface StockLot {
  id: StockLotId;
  variantId: VariantId;
  /** Units still available in this lot. Never negative. */
  remainingQty: number;
  /** Cost of ONE unit in this lot, in satang. Set at goods-receipt time. */
  unitCost: Satang;
  receivedAt: Date;
}

/** How many units were taken out of one lot, and what that slice cost. */
export interface LotConsumption {
  lotId: StockLotId;
  qty: number;
  unitCost: Satang;
  /** qty * unitCost, rounded once, at the slice level. */
  lineCost: Satang;
}

export interface ConsumeResult {
  /** Slices in FIFO order. Empty when qty is 0. */
  consumed: LotConsumption[];
  /** Sum of every lineCost. This is the COGS of the movement. */
  totalCost: Satang;
  /**
   * Units that had no lot to take from. Non-zero means the customer sold stock
   * the system does not know about - surface it, do not silently zero it.
   */
  shortfallQty: number;
}

export interface ConsumeOptions {
  /**
   * What to do when lots run out.
   *  - 'error'   : throw InsufficientStockError (use for POS bills)
   *  - 'shortfall': report shortfallQty and cost it at 0 (use for marketplace
   *                 imports, where the sale already happened in the real world)
   */
  onShortage: 'error' | 'shortfall';
}

/**
 * Take `qty` units out of `lots`, oldest first.
 *
 * Algorithm:
 *   1. sort lots by receivedAt asc, then id asc (stable tie-break)
 *   2. walk lots, take min(remaining, needed) from each
 *   3. stop when needed hits 0
 *   4. if lots run out, honour options.onShortage
 *
 * The function does NOT mutate `lots`. The caller applies the deltas.
 */
export const consumeFifo = (
  _lots: readonly StockLot[],
  _qty: number,
  _options: ConsumeOptions,
): ConsumeResult => {
  throw new NotImplementedError('consumeFifo');
};

/**
 * Put units back after a return or a cancelled order.
 *
 * A return is NOT a new purchase at today's price. It must restore the exact
 * cost that the original sale consumed, otherwise the margin report drifts.
 * That is why this takes the original `LotConsumption[]` instead of a quantity:
 * it re-credits each lot with the slice it gave up.
 *
 * Partial returns re-credit newest-consumed slice first, so a later partial
 * return of the same order stays consistent.
 */
export const restoreFifo = (
  _originalConsumption: readonly LotConsumption[],
  _qtyToRestore: number,
): { restored: LotConsumption[]; totalCost: Satang } => {
  throw new NotImplementedError('restoreFifo');
};

/** Current on-hand value of a variant = sum(remainingQty * unitCost). */
export const valueOfLots = (_lots: readonly StockLot[]): Satang => {
  throw new NotImplementedError('valueOfLots');
};

/** Weighted average unit cost, for display next to the FIFO number. */
export const averageUnitCost = (_lots: readonly StockLot[]): Satang => {
  throw new NotImplementedError('averageUnitCost');
};
