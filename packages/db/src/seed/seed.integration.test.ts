/**
 * Integration test for the seed invariants the price features depend on.
 *
 * Needs a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run db:migrate && bun run db:seed
 *
 * plus DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createDb } from '../client';
import { customers, priceTierPrices, priceTiers } from '../schema';
import { SEED_IDS } from './data';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

describe.skipIf(!db)('seed price tiers and customers', () => {
  afterAll(async () => {
    if (db) await db.$client.end();
  });

  test('seeds 3 tiers with exactly one default', async () => {
    if (!db) return;
    const tiers = await db.select().from(priceTiers);
    expect(tiers.length).toBe(3);
    expect(tiers.filter((tier) => tier.isDefault).length).toBe(1);
    const retail = tiers.find((tier) => tier.id === SEED_IDS.priceTiers.retail);
    expect(retail?.isDefault).toBe(true);
  });

  test('seeds 18 tier price rows', async () => {
    if (!db) return;
    const rows = await db.select().from(priceTierPrices);
    expect(rows.length).toBe(18);
  });

  test('seeds 5 customers', async () => {
    if (!db) return;
    const rows = await db.select().from(customers);
    expect(rows.length).toBe(5);
  });

  test('dealerNorth is on the dealer tier', async () => {
    if (!db) return;
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.id, SEED_IDS.customers.dealerNorth));
    expect(rows.length).toBe(1);
    expect(rows[0]?.priceTierId).toBe(SEED_IDS.priceTiers.dealer);
  });
});
