/**
 * Price tier + matrix + resolution route tests against the seeded database.
 *
 * They need a live Postgres with the migration applied and the seed loaded
 * (`bun run db:migrate && bun run db:seed`) plus DATABASE_URL. Without
 * DATABASE_URL the whole suite skips.
 *
 * The PUT test mutates the wholesale row (hoe -> 16_000, spade cell deleted).
 * `afterAll` writes the seeded values back, so the seed invariant stays intact
 * for the other suites.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { asOrgId, asPriceTierId, asVariantId, satang } from '@stockhub/core';
import { SEED_IDS, createDb, pricingRepo } from '@stockhub/db';
import { buildTestApp, jsonAs, requestAs } from '../test-utils';
import { priceTiersRouter } from './price-tiers';
import { pricingRouter } from './pricing';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const app = buildTestApp((v1) =>
  v1.route('/price-tiers', priceTiersRouter).route('/pricing', pricingRouter),
);

interface TierView {
  id: string;
  code: string;
  isDefault: boolean;
}

interface MatrixRow {
  variantId: string;
  sku: string;
  tierPrices: Record<string, number>;
}

interface Resolution {
  variantId: string;
  price: number;
  priceSource: 'tier' | 'default_tier' | 'selling_price';
  priceTierId?: string;
}

describe.skipIf(!url)('price tier + pricing routes (seeded database)', () => {
  afterAll(async () => {
    if (!db) return;
    // Restore exactly what the PUT test changed, by the same cell keys.
    await pricingRepo.upsertTierPrices(db, {
      orgId: asOrgId(SEED_IDS.org),
      priceTierId: asPriceTierId(SEED_IDS.priceTiers.wholesale),
      prices: [
        { variantId: asVariantId(SEED_IDS.variants.hoe), price: satang(16_700) },
        { variantId: asVariantId(SEED_IDS.variants.spade), price: satang(14_900) },
      ],
    });
    await db.$client.end();
  });

  test('owner lists the 3 seeded tiers with retail as default', async () => {
    const rows = await jsonAs<TierView[]>(app, '/api/v1/price-tiers', 'owner');
    expect(rows).toHaveLength(3);
    expect(rows.filter((tier) => tier.isDefault)).toHaveLength(1);
    expect(rows.find((tier) => tier.code === 'retail')?.isDefault).toBe(true);
  });

  test('matrix has 18 variants and the seeded hoe wholesale cell', async () => {
    const rows = await jsonAs<MatrixRow[]>(app, '/api/v1/price-tiers/matrix', 'owner');
    expect(rows).toHaveLength(18);
    const hoe = rows.find((row) => row.sku === 'HOE-001');
    expect(hoe?.tierPrices[SEED_IDS.priceTiers.wholesale]).toBe(16_700);
  });

  test('manager writes one tier row: upsert hoe, delete spade', async () => {
    const result = await jsonAs<{ upserted: number; deleted: number }>(
      app,
      `/api/v1/price-tiers/${SEED_IDS.priceTiers.wholesale}/prices`,
      'manager',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prices: [
            { variantId: SEED_IDS.variants.hoe, price: 16_000 },
            { variantId: SEED_IDS.variants.spade, price: null },
          ],
        }),
      },
    );
    expect(result.upserted).toBe(1);
    expect(result.deleted).toBe(1);

    const rows = await jsonAs<MatrixRow[]>(app, '/api/v1/price-tiers/matrix', 'owner');
    const hoe = rows.find((row) => row.sku === 'HOE-001');
    const spade = rows.find((row) => row.sku === 'SPD-001');
    expect(hoe?.tierPrices[SEED_IDS.priceTiers.wholesale]).toBe(16_000);
    expect(spade?.tierPrices[SEED_IDS.priceTiers.wholesale]).toBeUndefined();
  });

  test('sales is forbidden to write tier prices', async () => {
    const res = await requestAs(
      app,
      `/api/v1/price-tiers/${SEED_IDS.priceTiers.wholesale}/prices`,
      'sales',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prices: [{ variantId: SEED_IDS.variants.hoe, price: 1 }] }),
      },
    );
    expect(res.status).toBe(403);
  });

  test('resolve for a dealer customer hits the dealer tier, then falls back', async () => {
    const rows = await jsonAs<Resolution[]>(
      app,
      `/api/v1/pricing/resolve?variantIds=${SEED_IDS.variants.hoe},${SEED_IDS.variants.waterCan}&customerId=${SEED_IDS.customers.dealerNorth}`,
      'sales',
    );
    // The dealer buys the hoe at the dealer cell (185 x 0.82 rounded to whole baht).
    expect(rows[0]?.priceSource).toBe('tier');
    expect(rows[0]?.price).toBe(15_200);
    expect(rows[0]?.priceTierId).toBe(SEED_IDS.priceTiers.dealer);
    // The water can has NO dealer and NO retail cell, so it falls to the standard price.
    expect(rows[1]?.priceSource).toBe('selling_price');
    expect(rows[1]?.price).toBe(14_500);
    expect('priceTierId' in (rows[1] ?? {})).toBe(false);
  });

  test('resolve without a tier answers the standard selling price', async () => {
    const rows = await jsonAs<Resolution[]>(
      app,
      `/api/v1/pricing/resolve?variantIds=${SEED_IDS.variants.hoe},${SEED_IDS.variants.waterCan}&customerId=${SEED_IDS.customers.walkIn}`,
      'sales',
    );
    for (const row of rows) {
      expect(row.priceSource).toBe('selling_price');
    }
    expect(rows[0]?.price).toBe(18_500);
    expect(rows[1]?.price).toBe(14_500);

    // A variant id that does not exist is 404, not a silently skipped line.
    const res = await requestAs(
      app,
      `/api/v1/pricing/resolve?variantIds=99000000-0000-4000-8000-000000000001&customerId=${SEED_IDS.customers.walkIn}`,
      'sales',
    );
    expect(res.status).toBe(404);
  });

  test('stock_staff is forbidden to resolve prices', async () => {
    const res = await requestAs(
      app,
      `/api/v1/pricing/resolve?variantIds=${SEED_IDS.variants.hoe}`,
      'stock_staff',
    );
    expect(res.status).toBe(403);
  });
});
