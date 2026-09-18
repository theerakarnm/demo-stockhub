/**
 * Price tier, matrix and resolution route tests against the seeded database.
 *
 * The suite mutates ONLY tier price rows and restores the touched ones in
 * afterAll by re-running `upsertTierPrices` with the values read before the
 * mutation, so the seed stays valid for the next run. Without DATABASE_URL the
 * whole suite skips, so `bun test` stays green with no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
  asOrgId,
  asPriceTierId,
  asVariantId,
  tierPriceKey,
  type Role,
  type Satang,
  type VariantId,
} from '@stockhub/core';
import { SEED_IDS, createDb, pricingRepo } from '@stockhub/db';
import { buildTestApp, jsonAs, requestAs } from '../test-utils';
import { priceTiersRouter } from './price-tiers';
import { pricingRouter } from './pricing';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

// Repo functions take branded ids; SEED_IDS values are the same strings.
const orgId = asOrgId(SEED_IDS.org);
const wholesaleId = asPriceTierId(SEED_IDS.priceTiers.wholesale);
const hoeId = asVariantId(SEED_IDS.variants.hoe);
const spadeId = asVariantId(SEED_IDS.variants.spade);

/** The PriceTier wire shape this suite asserts on. */
interface TierWire {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
}

/** The PriceMatrixRow wire shape this suite asserts on. */
interface MatrixWire {
  variantId: string;
  sku: string;
  tierPrices: Record<string, number>;
}

/** The PriceResolutionView wire shape this suite asserts on. */
interface ResolutionWire {
  variantId: string;
  price: number;
  priceSource: string;
  priceTierId?: string;
}

const app = buildTestApp((v1) =>
  v1.route('/price-tiers', priceTiersRouter).route('/pricing', pricingRouter),
);

const putPrices = (role: Role, tierId: string, prices: unknown) =>
  requestAs(app, `/api/v1/price-tiers/${tierId}/prices`, role, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prices }),
  });

describe.skipIf(!url)('pricing routes (seeded database)', () => {
  /** hoe + spade wholesale rows before the PUT, restored in afterAll. */
  let seedWholesale: { variantId: VariantId; price: Satang }[] = [];

  afterAll(async () => {
    if (!db) return;
    if (seedWholesale.length > 0) {
      await pricingRepo.upsertTierPrices(db, {
        orgId,
        priceTierId: wholesaleId,
        prices: seedWholesale,
      });
    }
    await db.$client.end();
  });

  test('owner lists the 3 seed tiers', async () => {
    const tiers = await jsonAs<TierWire[]>(app, '/api/v1/price-tiers', 'owner');
    expect(tiers).toHaveLength(3);
    expect(tiers.map((tier) => tier.code)).toEqual(['retail', 'wholesale', 'dealer']);
    expect(tiers[0]?.isDefault).toBe(true);
  });

  test('matrix has 18 rows and the seeded hoe wholesale price', async () => {
    const matrix = await jsonAs<MatrixWire[]>(app, '/api/v1/price-tiers/matrix', 'owner');
    expect(matrix).toHaveLength(18);
    const hoe = matrix.find((row) => row.sku === 'HOE-001');
    expect(hoe?.tierPrices[SEED_IDS.priceTiers.wholesale]).toBe(16_700);
  });

  test('manager saves one changed cell and one cleared cell', async () => {
    // The map is keyed by tierPriceKey(tier, variant); read the two seed cells
    // before the mutation so afterAll can put them back.
    const map = db
      ? await pricingRepo.getTierPriceMap(db, {
          orgId,
          tierIds: [wholesaleId],
          variantIds: [hoeId, spadeId],
        })
      : new Map<string, Satang>();
    seedWholesale = [
      { variantId: hoeId, key: tierPriceKey(wholesaleId, hoeId) },
      { variantId: spadeId, key: tierPriceKey(wholesaleId, spadeId) },
    ].flatMap(({ variantId, key }) => {
      const price = map.get(key);
      return price === undefined ? [] : [{ variantId, price }];
    });

    const res = await putPrices('manager', SEED_IDS.priceTiers.wholesale, [
      { variantId: SEED_IDS.variants.hoe, price: 16_000 },
      { variantId: SEED_IDS.variants.spade, price: null },
    ]);
    expect(res.status).toBe(200);
    const saved = (await res.json()) as { upserted: number; deleted: number };
    expect(saved.upserted).toBe(1);
    expect(saved.deleted).toBe(1);

    const matrix = await jsonAs<MatrixWire[]>(app, '/api/v1/price-tiers/matrix', 'owner');
    const hoe = matrix.find((row) => row.sku === 'HOE-001');
    const spade = matrix.find((row) => row.sku === 'SPD-001');
    expect(hoe?.tierPrices[SEED_IDS.priceTiers.wholesale]).toBe(16_000);
    expect(spade?.tierPrices[SEED_IDS.priceTiers.wholesale]).toBeUndefined();
  });

  test('sales cannot write the matrix', async () => {
    const res = await putPrices('sales', SEED_IDS.priceTiers.wholesale, [
      { variantId: SEED_IDS.variants.hoe, price: 1 },
    ]);
    expect(res.status).toBe(403);
  });

  test('dealerNorth resolves hoe at the dealer price and waterCan at selling price', async () => {
    const rows = await jsonAs<ResolutionWire[]>(
      app,
      `/api/v1/pricing/resolve?variantIds=${SEED_IDS.variants.hoe},${
        SEED_IDS.variants.waterCan
      }&customerId=${SEED_IDS.customers.dealerNorth}`,
      'sales',
    );
    expect(rows.map((row) => row.variantId)).toEqual([
      SEED_IDS.variants.hoe,
      SEED_IDS.variants.waterCan,
    ]);
    expect(rows[0]?.priceSource).toBe('tier');
    expect(rows[0]?.price).toBe(15_200);
    expect(rows[1]?.priceSource).toBe('selling_price');
    expect(rows[1]?.price).toBe(14_500);
  });

  test('walkIn falls back to the selling price for both variants', async () => {
    const rows = await jsonAs<ResolutionWire[]>(
      app,
      `/api/v1/pricing/resolve?variantIds=${SEED_IDS.variants.hoe},${
        SEED_IDS.variants.waterCan
      }&customerId=${SEED_IDS.customers.walkIn}`,
      'sales',
    );
    expect(rows.every((row) => row.priceSource === 'selling_price')).toBe(true);
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
