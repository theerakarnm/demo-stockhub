/**
 * Inventory + movement route tests against the seeded database.
 *
 * These tests are READ-ONLY: every call is a GET, so the seed stays valid for
 * the next run. Without DATABASE_URL the whole suite skips - the gate proves
 * these tests really query the database instead of passing vacuously on mock
 * data (the assertions they replaced in index.test.ts ran on fixtures).
 */

import { describe, expect, test } from 'bun:test';
import { SEED_IDS } from '@stockhub/db';
import { buildTestApp, jsonAs } from '../test-utils';
import { inventoryRouter } from './inventory';
import { movementsRouter } from './movements';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('inventory routes (seeded database)', () => {
  const app = buildTestApp((v1) =>
    v1.route('/inventory', inventoryRouter).route('/movements', movementsRouter),
  );

  type Row = { variantId: string; sku: string; onHand: number; avgUnitCost?: number };
  type Detail = {
    variant: { sku: string; components?: { componentVariantId: string }[] };
    onHand: number;
    reserved: number;
    available: number;
    lots?: { id: string; remainingQty: number; unitCost?: number }[];
  };
  type MovementRow = { id: string; reason: string; qtyDelta: number; qtyAfter: number };

  test('owner sees the whole catalog with cost fields', async () => {
    const page = await jsonAs<{ items: Row[] }>(app, '/api/v1/inventory', 'owner');
    expect(page.items).toHaveLength(19);
    const hoe = page.items.find((row) => row.sku === 'HOE-001');
    expect(hoe?.avgUnitCost).toBeGreaterThan(0);
  });

  test('sales sees the same rows without any cost key', async () => {
    const owner = await jsonAs<{ items: Row[] }>(app, '/api/v1/inventory', 'owner');
    const sales = await jsonAs<{ items: Row[] }>(app, '/api/v1/inventory', 'sales');
    expect(sales.items).toHaveLength(owner.items.length);
    expect(sales.items.every((row) => !('avgUnitCost' in row))).toBe(true);
  });

  test('search narrows the inventory list to one SKU', async () => {
    const page = await jsonAs<{ items: Row[] }>(app, '/api/v1/inventory?q=HOE', 'owner');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.sku).toBe('HOE-001');
  });

  test('limit=5 pages keyset-style without repeating a variant', async () => {
    const firstPage = await jsonAs<{ items: Row[]; nextCursor: string | null }>(
      app,
      '/api/v1/inventory?limit=5',
      'owner',
    );
    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await jsonAs<{ items: Row[] }>(
      app,
      `/api/v1/inventory?limit=5&cursor=${firstPage.nextCursor ?? ''}`,
      'owner',
    );
    const servedIds = new Set(firstPage.items.map((row) => row.variantId));
    for (const row of secondPage.items) {
      expect(servedIds.has(row.variantId)).toBe(false);
    }
  });

  test('detail shows both lots to owner and hides the key from stock_staff', async () => {
    const owner = await jsonAs<Detail>(app, `/api/v1/inventory/${SEED_IDS.variants.hoe}`, 'owner');
    expect(owner.variant.sku).toBe('HOE-001');
    expect(owner.lots).toHaveLength(2);
    const staff = await jsonAs<Detail>(
      app,
      `/api/v1/inventory/${SEED_IDS.variants.hoe}`,
      'stock_staff',
    );
    expect(staff.onHand).toBe(owner.onHand);
    expect('lots' in staff).toBe(false);
  });

  test('a bundle borrows its availability from its components', async () => {
    const detail = await jsonAs<Detail>(
      app,
      `/api/v1/inventory/${SEED_IDS.variants.bundleWater}`,
      'owner',
    );
    expect(detail.variant.components).toHaveLength(3);
    // hose 35+25 = 60, nozzle 80+60 = 140, conn (300+200) / 2 = 250 -> min 60
    expect(detail.available).toBe(60);
    expect(detail.onHand).toBe(60);
  });

  test('movements list returns the seed ledger filtered by reason', async () => {
    const page = await jsonAs<{ items: MovementRow[] }>(
      app,
      '/api/v1/movements?reason=purchase_in&limit=50',
      'owner',
    );
    expect(page.items).toHaveLength(30);
    expect(page.items.every((movement) => movement.reason === 'purchase_in')).toBe(true);
    expect(typeof page.items[0]?.qtyAfter).toBe('number');
  });
});
