/**
 * Executable specification for movement planning.
 *
 * Pins how a business event becomes movement rows: outbound lines consume FIFO
 * lots, inbound lines open a lot or re-credit the original sale slices, and a
 * shortage follows the requested policy instead of guessing.
 *
 * Run: bun test packages/core/src/services/stock/movement.test.ts
 */

import { describe, expect, test } from 'bun:test';
import { asStockLotId, asVariantId, asWarehouseId } from '../../domain/ids';
import { satang } from '../../domain/money';
import type { LotConsumption, StockLot } from '../costing/fifo';
import { type PlannedMovement, planMovements } from './movement';

const warehouseId = asWarehouseId('wh_main');
const variantId = asVariantId('var_hoe_01');
const occurredAt = new Date('2026-03-01T00:00:00Z');

const lot = (id: string, qty: number, unitCostSatang: number, receivedAt: string): StockLot => ({
  id: asStockLotId(id),
  variantId,
  remainingQty: qty,
  unitCost: satang(unitCostSatang),
  receivedAt: new Date(receivedAt),
});

const ctx = (lots: readonly StockLot[]) => ({
  lotsByVariant: new Map([[variantId, lots]]),
});

/** One line, one planned movement - keeps each case on a single assertion path. */
const firstOf = (planned: readonly PlannedMovement[]): PlannedMovement => {
  if (planned.length !== 1) {
    throw new Error(`expected exactly one planned movement, got ${planned.length}`);
  }
  const movement = planned[0];
  if (movement === undefined) {
    throw new Error('expected a planned movement');
  }
  return movement;
};

describe('planMovements', () => {
  // The same 10 @ 100.00 + 10 @ 120.00 scene the FIFO engine tests pin.
  const lots = [
    lot('lot_a', 10, 10_000, '2026-01-10T00:00:00Z'),
    lot('lot_b', 10, 12_000, '2026-02-10T00:00:00Z'),
  ];

  test('sale_out consumes FIFO lots and prices COGS per slice', () => {
    const movement = firstOf(
      planMovements(
        { reason: 'sale_out', warehouseId, occurredAt, lines: [{ variantId, qty: 14 }] },
        ctx(lots),
      ),
    );

    expect(movement.qtyDelta).toBe(-14);
    // 10 * 100.00 + 4 * 120.00 = 1,480.00
    expect(movement.costTotal).toBe(satang(148_000));
    expect(movement.consumption).toHaveLength(2);
    expect(movement.consumption[0]?.lotId).toBe(asStockLotId('lot_a'));
    expect(movement.consumption[1]?.lotId).toBe(asStockLotId('lot_b'));
    expect(movement.shortfallQty).toBe(0);
    expect(movement.occurredAt).toBe(occurredAt);
  });

  test('purchase_in opens a new FIFO lot at the given unit cost', () => {
    const movement = firstOf(
      planMovements(
        {
          reason: 'purchase_in',
          warehouseId,
          occurredAt,
          lines: [{ variantId, qty: 5, unitCost: satang(9_000) }],
        },
        ctx([]),
      ),
    );

    // 5 * 90.00 = 450.00
    expect(movement.costTotal).toBe(satang(45_000));
    expect(movement.qtyDelta).toBe(5);
    expect(movement.newLot).toEqual({ unitCost: satang(9_000), qty: 5, receivedAt: occurredAt });
  });

  test('purchase_in without a unit cost is a validation error', () => {
    expect(() =>
      planMovements(
        { reason: 'purchase_in', warehouseId, occurredAt, lines: [{ variantId, qty: 5 }] },
        ctx([]),
      ),
    ).toThrow(/unit cost/);
  });

  test('return_in restores the original sale slices and their cost', () => {
    // The exact slices sale_out of 14 produced in the first case.
    const originalSale: LotConsumption[] = [
      {
        lotId: asStockLotId('lot_a'),
        qty: 10,
        unitCost: satang(10_000),
        lineCost: satang(100_000),
      },
      { lotId: asStockLotId('lot_b'), qty: 4, unitCost: satang(12_000), lineCost: satang(48_000) },
    ];
    const movement = firstOf(
      planMovements(
        {
          reason: 'return_in',
          warehouseId,
          occurredAt,
          lines: [{ variantId, qty: 4, restore: originalSale }],
        },
        ctx(lots),
      ),
    );

    // Partial returns re-credit the newest consumed slice first, so lot_b pays back the 4 units.
    expect(movement.lotRestores).toEqual([{ lotId: asStockLotId('lot_b'), qty: 4 }]);
    expect(movement.costTotal).toBe(satang(48_000));
    expect(movement.qtyDelta).toBe(4);
  });

  test('sale_out with shortagePolicy shortfall reports what it could not cover', () => {
    const movement = firstOf(
      planMovements(
        {
          reason: 'sale_out',
          warehouseId,
          occurredAt,
          lines: [{ variantId, qty: 25 }],
          shortagePolicy: 'shortfall',
        },
        ctx(lots),
      ),
    );

    // Only 20 units exist on the lots, so 5 are reported as shortfall, not thrown.
    expect(movement.qtyDelta).toBe(-20);
    expect(movement.shortfallQty).toBe(5);
  });

  test('a qty of zero is a validation error', () => {
    expect(() =>
      planMovements(
        { reason: 'sale_out', warehouseId, occurredAt, lines: [{ variantId, qty: 0 }] },
        ctx(lots),
      ),
    ).toThrow(/positive integer/);
  });
});
