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
 * The executable specification lives in ./fifo.test.ts.
 */

import type { StockLotId, VariantId } from '../../domain/ids';
import type { Satang } from '../../domain/money';
import { ZERO, mulMoney, satang } from '../../domain/money';
import { InsufficientStockError, StockHubError } from '../../errors';

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
const byFifoOrder = (a: StockLot, b: StockLot): number =>
  a.receivedAt.getTime() - b.receivedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const consumeFifo = (
  lots: readonly StockLot[],
  qty: number,
  options: ConsumeOptions,
): ConsumeResult => {
  if (!Number.isInteger(qty) || qty < 0) {
    throw new StockHubError('validation_error', 'Quantity must be a non-negative integer', { qty });
  }
  const consumed: LotConsumption[] = [];
  let needed = qty;
  let totalCost = 0;
  for (const lot of [...lots].sort(byFifoOrder)) {
    if (needed === 0) break;
    if (lot.remainingQty <= 0) continue;
    const take = Math.min(lot.remainingQty, needed);
    const lineCost = mulMoney(lot.unitCost, take);
    consumed.push({ lotId: lot.id, qty: take, unitCost: lot.unitCost, lineCost });
    totalCost += lineCost;
    needed -= take;
  }
  if (needed > 0 && options.onShortage === 'error') {
    const available = lots.reduce((sum, lot) => sum + Math.max(lot.remainingQty, 0), 0);
    throw new InsufficientStockError(lots[0]?.variantId ?? 'unknown', qty, available);
  }
  return { consumed, totalCost: satang(totalCost), shortfallQty: needed };
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
  originalConsumption: readonly LotConsumption[],
  qtyToRestore: number,
): { restored: LotConsumption[]; totalCost: Satang } => {
  const restored: LotConsumption[] = [];
  let remaining = qtyToRestore;
  let totalCost = 0;
  // Newest consumed slice first, so a second partial return keeps walking backwards.
  for (const slice of [...originalConsumption].reverse()) {
    if (remaining === 0) break;
    const give = Math.min(slice.qty, remaining);
    const lineCost = mulMoney(slice.unitCost, give);
    restored.push({ lotId: slice.lotId, qty: give, unitCost: slice.unitCost, lineCost });
    totalCost += lineCost;
    remaining -= give;
  }
  if (remaining > 0) {
    throw new StockHubError(
      'validation_error',
      'Cannot restore more units than the sale consumed',
      {
        qtyToRestore,
        consumed: qtyToRestore - remaining,
      },
    );
  }
  return { restored, totalCost: satang(totalCost) };
};

/** Current on-hand value of a variant = sum(remainingQty * unitCost). */
export const valueOfLots = (lots: readonly StockLot[]): Satang =>
  satang(lots.reduce((sum, lot) => sum + mulMoney(lot.unitCost, lot.remainingQty), 0));

/** Weighted average unit cost, for display next to the FIFO number. */
export const averageUnitCost = (lots: readonly StockLot[]): Satang => {
  const units = lots.reduce((sum, lot) => sum + lot.remainingQty, 0);
  return units === 0 ? ZERO : satang(Math.round(valueOfLots(lots) / units));
};
