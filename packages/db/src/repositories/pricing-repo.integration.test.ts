/**
 * Integration tests for the customer and pricing repositories.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run db:migrate && bun run db:seed
 *
 * plus DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 *
 * Every test runs inside a transaction that is rolled back at the end, so the
 * tests can write freely and still leave the seeded demo data untouched.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { type Satang, asCustomerId, asOrgId, asPriceTierId, asVariantId, fromBaht } from '@stockhub/core';
import { createDb, type DbExecutor } from '../client';
import { SEED_IDS } from '../seed/data';
import { customerRepo, pricingRepo } from './index';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const orgId = asOrgId(SEED_IDS.org);
const hoe = asVariantId(SEED_IDS.variants.hoe);
const spade = asVariantId(SEED_IDS.variants.spade);
const wholesale = asPriceTierId(SEED_IDS.priceTiers.wholesale);
const dealer = asPriceTierId(SEED_IDS.priceTiers.dealer);

/** Marker error used to force the surrounding transaction to roll back. */
class Rollback extends Error {}

const inRollbackTx = async (fn: (tx: DbExecutor) => Promise<void>): Promise<void> => {
  if (!db) return;
  await db.transaction(async (tx) => {
    try {
      await fn(tx);
    } finally {
      throw new Rollback();
    }
  }).catch((error: unknown) => {
    if (!(error instanceof Rollback)) throw error;
  });
};

describe.skipIf(!db)('pricing and customer repositories', () => {
  afterAll(async () => {
    if (db) await db.$client.end();
  });

  test('listTiers returns the 3 seeded tiers with retail as default', async () => {
    if (!db) return;
    const tiers = await pricingRepo.listTiers(db, { orgId });
    expect(tiers.map((tier) => tier.code)).toEqual(['retail', 'wholesale', 'dealer']);
    expect(tiers.find((tier) => tier.isDefault)?.id).toBe(SEED_IDS.priceTiers.retail);
  });

  test('getTierPriceMap finds the wholesale hoe cell at 167.00', async () => {
    if (!db) return;
    const map = await pricingRepo.getTierPriceMap(db, { orgId, tierIds: [wholesale], variantIds: [hoe] });
    expect(map.get(`${wholesale}::${hoe}`)).toBe(fromBaht(167));
  });

  test('upsertTierPrices upserts and deletes, and a second identical run deletes nothing', async () => {
    if (!db) return;
    await inRollbackTx(async (tx) => {
      const first = await pricingRepo.upsertTierPrices(tx, {
        orgId,
        priceTierId: wholesale,
        prices: [
          { variantId: hoe, price: null },
          { variantId: spade, price: fromBaht(150) },
        ],
      });
      expect(first).toEqual({ upserted: 1, deleted: 1 });

      const second = await pricingRepo.upsertTierPrices(tx, {
        orgId,
        priceTierId: wholesale,
        prices: [
          { variantId: hoe, price: null },
          { variantId: spade, price: fromBaht(150) },
        ],
      });
      expect(second).toEqual({ upserted: 1, deleted: 0 });
    });
  });

  test('listMatrix covers 18 variants and leaves unpriced cells undefined', async () => {
    if (!db) return;
    const rows = await pricingRepo.listMatrix(db, { orgId });
    expect(rows.length).toBe(18);
    const waterCan = rows.find((row) => row.sku === 'WCN-10L');
    expect(waterCan?.prices[dealer]).toBeUndefined();
    // The hoe dealer cell (185 x 0.82 rounded) is present for comparison.
    const hoeRow = rows.find((row) => row.sku === 'HOE-001');
    expect(hoeRow?.prices[dealer]).toBe(fromBaht(152) as Satang);
  });

  test('createCustomer then updateCustomer to the dealer tier round-trips', async () => {
    if (!db) return;
    await inRollbackTx(async (tx) => {
      const created = await customerRepo.createCustomer(tx, {
        orgId,
        name: 'ลูกค้าทดสอบร้านค้า',
        priceTierId: SEED_IDS.priceTiers.wholesale,
      });
      expect(created.priceTierId).toBe(SEED_IDS.priceTiers.wholesale);

      const updated = await customerRepo.updateCustomer(tx, {
        orgId,
        customerId: asCustomerId(created.id),
        patch: { priceTierId: SEED_IDS.priceTiers.dealer },
      });
      expect(updated.priceTierId).toBe(SEED_IDS.priceTiers.dealer);

      const fetched = await customerRepo.getCustomer(tx, {
        orgId,
        customerId: asCustomerId(created.id),
      });
      expect(fetched?.priceTierCode).toBe('dealer');
    });
  });

  test('updateCustomer on an unknown id throws not_found', async () => {
    if (!db) return;
    const ghost = asCustomerId('24800000-0000-4000-8000-000000000001');
    let code = '';
    try {
      await customerRepo.updateCustomer(db, { orgId, customerId: ghost, patch: { name: 'x' } });
    } catch (error) {
      code = error instanceof Error ? error.message : '';
      expect((error as { code?: string }).code).toBe('not_found');
    }
    expect(code).not.toBe('');
  });
});
