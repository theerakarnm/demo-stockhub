/**
 * Executable specification for the FIFO engine.
 *
 * Every test is `.skip` because the engine is still a stub. Remove `.skip` one
 * test at a time as you implement consumeFifo / restoreFifo - that gives you a
 * ready-made TDD loop instead of a blank file.
 *
 * Run: bun test
 */

import { describe, expect, test } from 'bun:test';
import { asStockLotId, asVariantId } from '../../domain/ids';
import { satang } from '../../domain/money';
import { type StockLot, consumeFifo, restoreFifo } from './fifo';

const variantId = asVariantId('var_hoe_01');

const lot = (id: string, qty: number, unitCostSatang: number, receivedAt: string): StockLot => ({
  id: asStockLotId(id),
  variantId,
  remainingQty: qty,
  unitCost: satang(unitCostSatang),
  receivedAt: new Date(receivedAt),
});

describe('consumeFifo', () => {
  const lots = [
    lot('lot_a', 10, 10_000, '2026-01-10T00:00:00Z'), // 10 units @ 100.00
    lot('lot_b', 10, 12_000, '2026-02-10T00:00:00Z'), // 10 units @ 120.00
  ];

  test.skip('takes from the oldest lot first', () => {
    const result = consumeFifo(lots, 4, { onShortage: 'error' });

    expect(result.consumed).toEqual([
      { lotId: asStockLotId('lot_a'), qty: 4, unitCost: satang(10_000), lineCost: satang(40_000) },
    ]);
    expect(result.totalCost).toBe(satang(40_000));
    expect(result.shortfallQty).toBe(0);
  });

  test.skip('spans multiple lots and sums the cost of each slice', () => {
    const result = consumeFifo(lots, 14, { onShortage: 'error' });

    expect(result.consumed).toHaveLength(2);
    // 10 * 100.00 + 4 * 120.00 = 1,480.00
    expect(result.totalCost).toBe(satang(148_000));
  });

  test.skip('does not mutate the input lots', () => {
    const snapshot = structuredClone(lots);
    consumeFifo(lots, 5, { onShortage: 'error' });
    expect(lots).toEqual(snapshot);
  });

  test.skip('throws when onShortage is "error" and stock runs out', () => {
    expect(() => consumeFifo(lots, 999, { onShortage: 'error' })).toThrow(/insufficient/i);
  });

  test.skip('reports a shortfall instead of throwing for marketplace imports', () => {
    const result = consumeFifo(lots, 25, { onShortage: 'shortfall' });

    expect(result.shortfallQty).toBe(5);
    expect(result.totalCost).toBe(satang(220_000)); // only the 20 real units are costed
  });

  test.skip('returns an empty result for a zero quantity', () => {
    const result = consumeFifo(lots, 0, { onShortage: 'error' });
    expect(result.consumed).toEqual([]);
    expect(result.totalCost).toBe(satang(0));
  });
});

describe('restoreFifo', () => {
  test.skip('gives back the exact cost the sale consumed, not today price', () => {
    const consumption = [
      {
        lotId: asStockLotId('lot_a'),
        qty: 10,
        unitCost: satang(10_000),
        lineCost: satang(100_000),
      },
      { lotId: asStockLotId('lot_b'), qty: 4, unitCost: satang(12_000), lineCost: satang(48_000) },
    ];

    const result = restoreFifo(consumption, 14);
    expect(result.totalCost).toBe(satang(148_000));
  });

  test.skip('restores the newest consumed slice first on a partial return', () => {
    const consumption = [
      {
        lotId: asStockLotId('lot_a'),
        qty: 10,
        unitCost: satang(10_000),
        lineCost: satang(100_000),
      },
      { lotId: asStockLotId('lot_b'), qty: 4, unitCost: satang(12_000), lineCost: satang(48_000) },
    ];

    const result = restoreFifo(consumption, 4);
    expect(result.restored).toEqual([
      { lotId: asStockLotId('lot_b'), qty: 4, unitCost: satang(12_000), lineCost: satang(48_000) },
    ]);
  });
});
