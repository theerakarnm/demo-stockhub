/**
 * Integration tests for the stock overview and movement history reads.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 * Every test below is a pure read against the seed, so the seed invariant
 * stays intact for the guards test.
 *
 * The numbers the assertions rely on come from the seed data: the hoe has two
 * open lots (60 @ 12,000 + 40 @ 13,200 satang), the three fertiliser variants
 * share product names containing ปุ๋ย, and the 30 opening `purchase_in`
 * movements include both hoe layers.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { asOrgId, asVariantId } from '@stockhub/core';
import { createDb } from '../client';
import { SEED_IDS } from '../seed/data';
import { movementRepo } from './index';
import { getStockOverview } from './inventory-repo';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const orgId = asOrgId(SEED_IDS.org);

describe.skipIf(!db)('stock overview and movement history', () => {
  afterAll(async () => {
    if (db) await db.$client.end();
  });

  test('overview returns the 19 seed variants with the hoe FIFO numbers', async () => {
    if (!db) return;
    const rows = await getStockOverview(db, { orgId, limit: 100 });
    expect(rows).toHaveLength(19);
    const hoe = rows.find((row) => row.sku === 'HOE-001');
    // 60 @ 12,000 + 40 @ 13,200 satang across the two open lots.
    expect(hoe?.onHand).toBe(100);
    expect(hoe?.stockValue).toBe(1_248_000);
    expect(hoe?.avgUnitCost).toBe(12_480);
    // Bundles own no lots, so they read 0 here; Task 12 overlays availability.
    const bundle = rows.find((row) => row.kind === 'bundle');
    expect(bundle?.onHand).toBe(0);
  });

  test('search ปุ๋ย finds exactly the four fertiliser variants', async () => {
    if (!db) return;
    const rows = await getStockOverview(db, { orgId, search: 'ปุ๋ย', limit: 50 });
    expect(rows.map((row) => row.sku).sort()).toEqual([
      'FRT-161616-25',
      'FRT-161616-50',
      'FRT-ORG-25',
      'FRT-UREA-50',
    ]);
  });

  test('limit 5 returns 6 rows and the keyset continues without repeating', async () => {
    if (!db) return;
    const firstPage = await getStockOverview(db, { orgId, limit: 5 });
    // One extra row beyond the limit is how the caller knows a cursor follows.
    expect(firstPage).toHaveLength(6);
    const fifth = firstPage[4];
    if (!fifth) throw new Error('expected a fifth row on the first page');
    const secondPage = await getStockOverview(db, {
      orgId,
      limit: 5,
      after: { name: fifth.productName, id: fifth.variantId },
    });
    expect(secondPage).toHaveLength(6);
    // Only the first `limit` rows were served; the 6th was the peek row, so
    // the no-repeat guarantee covers the served page, exactly like the
    // caller's `rows.slice(0, limit)` in the service layer.
    const servedIds = new Set(firstPage.slice(0, 5).map((row) => row.variantId));
    for (const row of secondPage) {
      expect(servedIds.has(row.variantId)).toBe(false);
    }
  });

  test('hoe history shows the running balance 60 then 100, oldest first', async () => {
    if (!db) return;
    const rows = await movementRepo.listHistory(db, {
      orgId,
      variantId: asVariantId(SEED_IDS.variants.hoe),
    });
    expect(rows).toHaveLength(2);
    // listHistory is newest first; the seed ledger reads 60 then 100 forward.
    const oldestFirst = [...rows].reverse();
    expect(oldestFirst[0]?.reason).toBe('purchase_in');
    expect(oldestFirst[0]?.qtyDelta).toBe(60);
    expect(oldestFirst[0]?.qtyAfter).toBe(60);
    expect(oldestFirst[1]?.reason).toBe('purchase_in');
    expect(oldestFirst[1]?.qtyDelta).toBe(40);
    expect(oldestFirst[1]?.qtyAfter).toBe(100);
  });
});
