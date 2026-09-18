/**
 * Integration tests for the customer and pricing repositories.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 *
 * Every mutating test runs inside a transaction that is rolled back at the
 * end, so the seeded demo data is never touched.
 */

import { describe, expect, test } from 'bun:test';
import {
  type CustomerId,
  type PriceTierId,
  StockHubError,
  type VariantId,
  asCustomerId,
  asOrgId,
  asPriceTierId,
  asVariantId,
  fromBaht,
  tierPriceKey,
} from '@stockhub/core';
import { TransactionRollbackError } from 'drizzle-orm';
import { type DbExecutor, createDb } from '../client';
import { SEED_IDS } from '../seed/data';
import { customerRepo, pricingRepo } from './index';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const orgId = asOrgId(SEED_IDS.org);
const wholesaleId = asPriceTierId(SEED_IDS.priceTiers.wholesale);
const dealerId = asPriceTierId(SEED_IDS.priceTiers.dealer);
const hoeId = asVariantId(SEED_IDS.variants.hoe);
const spadeId = asVariantId(SEED_IDS.variants.spade);

/**
 * Run mutations inside a transaction that always rolls back. The thrown
 * TransactionRollbackError is how drizzle marks a deliberate rollback, so it
 * is swallowed here and everything else propagates.
 */
const inRollback = async (fn: (exec: DbExecutor) => Promise<void>): Promise<void> => {
  if (!db) throw new Error('test database is not available');
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
};

describe.skipIf(!db)('customer and pricing repositories', () => {
  test('listTiers returns the 3 seed tiers with retail as the default', async () => {
    if (!db) return;
    const tiers = await pricingRepo.listTiers(db, { orgId });
    expect(tiers).toHaveLength(3);
    expect(tiers[0]?.code).toBe('retail');
    expect(tiers[0]?.isDefault).toBe(true);
    const defaultTier = await pricingRepo.getDefaultTier(db, { orgId });
    expect(defaultTier?.code).toBe('retail');
  });

  test('getTierPriceMap finds the hoe wholesale price 167.00', async () => {
    if (!db) return;
    const map = await pricingRepo.getTierPriceMap(db, {
      orgId,
      tierIds: [wholesaleId],
      variantIds: [hoeId],
    });
    // 185 x 0.9 = 166.5 rounds to 167 with Math.round in the seed.
    expect(map.get(tierPriceKey(wholesaleId, hoeId))).toBe(fromBaht(167));
  });

  test('upsertTierPrices deletes a cleared cell and upserts a set cell', async () => {
    if (!db) return;
    await inRollback(async (exec) => {
      const first = await pricingRepo.upsertTierPrices(exec, {
        orgId,
        priceTierId: wholesaleId,
        prices: [
          { variantId: hoeId, price: null },
          { variantId: spadeId, price: fromBaht(150) },
        ],
      });
      expect(first).toEqual({ upserted: 1, deleted: 1 });

      // Re-running the same edit is idempotent: nothing left to delete.
      const second = await pricingRepo.upsertTierPrices(exec, {
        orgId,
        priceTierId: wholesaleId,
        prices: [
          { variantId: hoeId, price: null },
          { variantId: spadeId, price: fromBaht(150) },
        ],
      });
      expect(second).toEqual({ upserted: 1, deleted: 0 });
    });
  });

  test('listMatrix lists every active variant and leaves unset tier prices absent', async () => {
    if (!db) return;
    const rows = await pricingRepo.listMatrix(db, { orgId });
    expect(rows).toHaveLength(18);
    const waterCan = rows.find((row) => row.sku === 'WCN-10L');
    expect(waterCan?.prices[SEED_IDS.priceTiers.dealer]).toBeUndefined();
    expect(waterCan?.prices[SEED_IDS.priceTiers.wholesale]).toBeUndefined();
  });

  test('createCustomer then updateCustomer round-trips the tier', async () => {
    if (!db) return;
    await inRollback(async (exec) => {
      const created = await customerRepo.createCustomer(exec, {
        orgId,
        name: 'ลูกค้าทดสอบ repo',
      });
      expect(created.priceTierId).toBeNull();

      const updated = await customerRepo.updateCustomer(exec, {
        orgId,
        customerId: asCustomerId(created.id),
        patch: { priceTierId: SEED_IDS.priceTiers.dealer },
      });
      expect(updated.priceTierId).toBe(SEED_IDS.priceTiers.dealer);

      const readBack = await customerRepo.getCustomer(exec, {
        orgId,
        customerId: asCustomerId(created.id),
      });
      expect(readBack?.priceTierCode).toBe('dealer');
      expect(readBack?.priceTierName).toBe('ราคาตัวแทน');
    });
  });

  test('updateCustomer on an unknown id throws not_found', async () => {
    if (!db) return;
    const missingId = asCustomerId(crypto.randomUUID() as CustomerId);
    try {
      await customerRepo.updateCustomer(db, {
        orgId,
        customerId: missingId,
        patch: { isActive: false },
      });
      throw new Error('expected updateCustomer to throw not_found');
    } catch (error) {
      expect(error instanceof StockHubError).toBe(true);
      if (error instanceof StockHubError) expect(error.code).toBe('not_found');
    }
  });
});
