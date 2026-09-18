/**
 * Integration tests for the FIFO ledger writes.
 *
 * These prove that `recordMovements` + `applyLotDeltas` keep the ledger and the
 * lots in agreement inside one transaction, and - with case 5 - that the
 * `SELECT ... FOR UPDATE` lock really serialises two parallel sells of the
 * same stock: exactly one may win.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 *
 * Everything below runs on a throwaway product + variant created in
 * `beforeAll`, so the seeded demo stock is never touched. `afterAll` deletes
 * what the tests wrote in FK order (consumptions -> lots -> movements ->
 * variant -> product), which keeps the seed invariant intact for the guards
 * test.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  InsufficientStockError,
  type LotConsumption,
  StockHubError,
  asOrgId,
  asStockLotId,
  asVariantId,
  asWarehouseId,
  planMovements,
  satang,
} from '@stockhub/core';
import { eq, inArray } from 'drizzle-orm';
import { createDb } from '../client';
import { movementLotConsumptions, products, stockLots, stockMovements, variants } from '../schema';
import { SEED_IDS } from '../seed/data';
import { inventoryRepo, movementRepo } from './index';
import { getOpenLotsForUpdate } from './inventory-repo';
import type { RecordedMovement } from './movement-repo';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const orgId = asOrgId(SEED_IDS.org);
const warehouseId = asWarehouseId(SEED_IDS.warehouse);
// Random suffix keeps parallel CI runs of the same suite from colliding on
// the (org_id, sku) unique index.
const sku = `TEST-FIFO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** 100.00 THB per unit, the only unit cost the scenarios below use. */
const UNIT_COST = satang(10_000);

describe.skipIf(!db)('FIFO ledger writes', () => {
  let productId = '';
  let variantId = '';
  let lotId = asStockLotId('');
  let saleSlices: LotConsumption[] = [];

  beforeAll(async () => {
    if (!db) return;
    const [product] = await db
      .insert(products)
      .values({ orgId, name: 'สินค้าทดสอบ FIFO' })
      .returning({ id: products.id });
    if (!product) throw new Error('product insert returned no row');
    productId = product.id;
    const [variant] = await db
      .insert(variants)
      .values({ orgId, productId, sku, name: 'หน่วยทดสอบ' })
      .returning({ id: variants.id });
    if (!variant) throw new Error('variant insert returned no row');
    variantId = variant.id;
  });

  afterAll(async () => {
    if (!db) return;
    // FK order: consumptions -> lots -> movements -> variant -> product.
    const movements = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.variantId, asVariantId(variantId)));
    if (movements.length > 0) {
      await db.delete(movementLotConsumptions).where(
        inArray(
          movementLotConsumptions.movementId,
          movements.map((row) => row.id),
        ),
      );
    }
    await db.delete(stockLots).where(eq(stockLots.variantId, asVariantId(variantId)));
    await db.delete(stockMovements).where(eq(stockMovements.variantId, asVariantId(variantId)));
    if (variantId) await db.delete(variants).where(eq(variants.id, variantId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    await db.$client.end();
  });

  const receive = async (qty: number): Promise<RecordedMovement[]> => {
    if (!db) throw new Error('test database is not available');
    return db.transaction(async (tx) =>
      movementRepo.recordMovements(tx, {
        orgId,
        reference: 'PO-TEST-FIFO',
        planned: planMovements(
          {
            reason: 'purchase_in',
            warehouseId,
            occurredAt: new Date(),
            lines: [{ variantId: asVariantId(variantId), qty, unitCost: UNIT_COST }],
          },
          { lotsByVariant: new Map() },
        ),
      }),
    );
  };

  const sell = async (qty: number, orderId?: string): Promise<RecordedMovement[]> => {
    if (!db) throw new Error('test database is not available');
    return db.transaction(async (tx) => {
      const lots = await getOpenLotsForUpdate(tx, {
        orgId,
        variantId: asVariantId(variantId),
        warehouseId,
      });
      return movementRepo.recordMovements(tx, {
        orgId,
        orderId,
        planned: planMovements(
          {
            reason: 'sale_out',
            warehouseId,
            occurredAt: new Date(),
            lines: [{ variantId: asVariantId(variantId), qty }],
          },
          { lotsByVariant: new Map([[asVariantId(variantId), lots]]) },
        ),
      });
    });
  };

  const lotById = async () => {
    if (!db) throw new Error('test database is not available');
    const [lot] = await db.select().from(stockLots).where(eq(stockLots.id, lotId));
    return lot;
  };

  test('receive 10 @ 100.00 opens one lot of 10 with a 100_000 movement', async () => {
    if (!db) return;
    const [recorded] = await receive(10);
    expect(recorded?.qtyDelta).toBe(10);
    expect(recorded?.costTotal).toBe(100_000);

    const lots = await db
      .select()
      .from(stockLots)
      .where(eq(stockLots.variantId, asVariantId(variantId)));
    expect(lots).toHaveLength(1);
    const lot = lots[0];
    expect(lot?.qty).toBe(10);
    expect(lot?.remainingQty).toBe(10);
    expect(lot?.reference).toBe('PO-TEST-FIFO');
    if (lot) lotId = asStockLotId(lot.id);

    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.variantId, asVariantId(variantId)));
    expect(movements).toHaveLength(1);
    expect(movements[0]?.qtyDelta).toBe(10);
    expect(movements[0]?.costTotal).toBe(100_000);
  });

  test('sell 4 consumes the lot down to 6 and records one 40_000 slice', async () => {
    if (!db) return;
    const [recorded] = await sell(4, SEED_IDS.orders.posWalkIn);
    expect(recorded?.qtyDelta).toBe(-4);
    expect(recorded?.costTotal).toBe(40_000);
    if (!recorded) return;

    expect((await lotById())?.remainingQty).toBe(6);

    const slices = await db
      .select()
      .from(movementLotConsumptions)
      .where(eq(movementLotConsumptions.movementId, recorded.movementId));
    expect(slices).toHaveLength(1);
    expect(slices[0]?.lotId).toBe(lotId);
    expect(slices[0]?.qty).toBe(4);
    expect(slices[0]?.unitCost).toBe(10_000);
    expect(slices[0]?.lineCost).toBe(40_000);
  });

  test('listMovementsForOrder returns the sale with its one consumption', async () => {
    if (!db) return;
    // A seeded order id stands in for the marketplace order behind the sale.
    const rows = await movementRepo.listMovementsForOrder(db, {
      orgId,
      orderId: SEED_IDS.orders.posWalkIn,
    });
    expect(rows).toHaveLength(1);
    const sale = rows[0];
    expect(sale?.qtyDelta).toBe(-4);
    expect(sale?.costTotal).toBe(40_000);
    expect(sale?.consumptions).toHaveLength(1);
    const slice = sale?.consumptions[0];
    expect(slice?.lotId).toBe(lotId);
    expect(slice?.qty).toBe(4);
    expect(slice?.unitCost).toBe(UNIT_COST);
    expect(slice?.lineCost).toBe(satang(40_000));
    saleSlices = sale?.consumptions ?? [];
  });

  test('return 4 restores the original cost into the original lot', async () => {
    if (!db) return;
    expect(saleSlices).toHaveLength(1);
    const [recorded] = await db.transaction(async (tx) =>
      movementRepo.recordMovements(tx, {
        orgId,
        planned: planMovements(
          {
            reason: 'return_in',
            warehouseId,
            occurredAt: new Date(),
            lines: [{ variantId: asVariantId(variantId), qty: 4, restore: saleSlices }],
          },
          { lotsByVariant: new Map() },
        ),
      }),
    );
    expect(recorded?.qtyDelta).toBe(4);
    expect(recorded?.costTotal).toBe(40_000);
    expect((await lotById())?.remainingQty).toBe(10);
  });

  test('two parallel sells of 8 with 10 on hand: one fulfils, one rejects, 2 left', async () => {
    if (!db) return;
    const results = await Promise.allSettled([sell(8), sell(8)]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toBeInstanceOf(InsufficientStockError);
    const reason = rejected?.reason;
    if (reason instanceof StockHubError) {
      expect(reason.code).toBe('insufficient_stock');
    } else {
      throw new Error(`expected a StockHubError rejection, got ${String(reason)}`);
    }
    expect((await lotById())?.remainingQty).toBe(2);
  });

  test('applyLotDeltas rejects an over-consuming delta with conflict and changes nothing', async () => {
    if (!db) return;
    let thrown: unknown;
    try {
      await db.transaction(async (tx) => {
        await inventoryRepo.applyLotDeltas(tx, [{ lotId, qty: 99 }]);
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(StockHubError);
    if (thrown instanceof StockHubError) {
      expect(thrown.code).toBe('conflict');
    } else {
      throw new Error(`expected a StockHubError, got ${String(thrown)}`);
    }
    expect((await lotById())?.remainingQty).toBe(2);
  });
});
