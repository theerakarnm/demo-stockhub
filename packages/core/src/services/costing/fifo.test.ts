/**
 * Executable specification for the FIFO engine.
 *
 * The engine is implemented, so the whole suite runs; it also pins the
 * scene-3 demo figures from the Wave 1 plan (103,400 baht).
 *
 * Run: bun test
 */

import { describe, expect, test } from 'bun:test';
import { asStockLotId, asVariantId } from '../../domain/ids';
import { fromBaht, satang } from '../../domain/money';
import { type StockLot, averageUnitCost, consumeFifo, restoreFifo, valueOfLots } from './fifo';

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

  test('takes from the oldest lot first', () => {
    const result = consumeFifo(lots, 4, { onShortage: 'error' });

    expect(result.consumed).toEqual([
      { lotId: asStockLotId('lot_a'), qty: 4, unitCost: satang(10_000), lineCost: satang(40_000) },
    ]);
    expect(result.totalCost).toBe(satang(40_000));
    expect(result.shortfallQty).toBe(0);
  });

  test('spans multiple lots and sums the cost of each slice', () => {
    const result = consumeFifo(lots, 14, { onShortage: 'error' });

    expect(result.consumed).toHaveLength(2);
    // 10 * 100.00 + 4 * 120.00 = 1,480.00
    expect(result.totalCost).toBe(satang(148_000));
  });

  test('does not mutate the input lots', () => {
    const snapshot = structuredClone(lots);
    consumeFifo(lots, 5, { onShortage: 'error' });
    expect(lots).toEqual(snapshot);
  });

  test('throws when onShortage is "error" and stock runs out', () => {
    expect(() => consumeFifo(lots, 999, { onShortage: 'error' })).toThrow(/insufficient/i);
  });

  test('reports a shortfall instead of throwing for marketplace imports', () => {
    const result = consumeFifo(lots, 25, { onShortage: 'shortfall' });

    expect(result.shortfallQty).toBe(5);
    expect(result.totalCost).toBe(satang(220_000)); // only the 20 real units are costed
  });

  test('returns an empty result for a zero quantity', () => {
    const result = consumeFifo(lots, 0, { onShortage: 'error' });
    expect(result.consumed).toEqual([]);
    expect(result.totalCost).toBe(satang(0));
  });
});

describe('restoreFifo', () => {
  test('gives back the exact cost the sale consumed, not today price', () => {
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

  test('restores the newest consumed slice first on a partial return', () => {
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

describe('scene 3 of the demo script', () => {
  // ASSUMPTION (see plan): older lot 60 @ 1,000.00, newer lot 50 @ 1,085.00, sell 100.
  // 60 x 1,000 + 40 x 1,085 = 103,400.00 baht. Replace the lot numbers with the demo script's
  // once it is available; the 103,400 figure is the customer-facing requirement.
  const sceneLots = [
    lot('lot_scene_old', 60, fromBaht(1000), '2026-05-01T00:00:00Z'),
    lot('lot_scene_new', 50, fromBaht(1085), '2026-06-01T00:00:00Z'),
  ];
  test('selling 100 units costs exactly 103,400 baht', () => {
    const result = consumeFifo(sceneLots, 100, { onShortage: 'error' });
    expect(result.consumed.map((s) => [s.lotId, s.qty])).toEqual([
      [asStockLotId('lot_scene_old'), 60],
      [asStockLotId('lot_scene_new'), 40],
    ]);
    expect(result.totalCost).toBe(fromBaht(103_400));
    expect(result.shortfallQty).toBe(0);
  });
  test('returning 40 restores the newer slice at its own cost', () => {
    const sale = consumeFifo(sceneLots, 100, { onShortage: 'error' });
    const back = restoreFifo(sale.consumed, 40);
    expect(back.totalCost).toBe(fromBaht(43_400));
    expect(back.restored[0]?.lotId).toBe(asStockLotId('lot_scene_new'));
  });
  test('value and average of the open lots', () => {
    expect(valueOfLots(sceneLots)).toBe(fromBaht(114_250));
    expect(averageUnitCost(sceneLots)).toBe(satang(Math.round(11_425_000 / 110)));
  });
});
