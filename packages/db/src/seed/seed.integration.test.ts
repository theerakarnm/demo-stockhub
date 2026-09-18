/**
 * Integration tests for the seeded price tiers and customers.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && DATABASE_URL=... bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { createDb } from '../client';
import { customers, priceTierPrices, priceTiers } from '../schema';
import { SEED_IDS } from './data';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

describe.skipIf(!db)('seeded price tiers and customers', () => {
  afterAll(async () => {
    if (db) await db.$client.end();
  });

  test('seeds 3 tiers with exactly one default', async () => {
    if (!db) return;
    const rows = await db.select().from(priceTiers);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.isDefault)).toHaveLength(1);
    expect(rows.find((row) => row.isDefault)?.code).toBe('retail');
  });

  test('seeds 18 tier price rows', async () => {
    if (!db) return;
    const rows = await db.select().from(priceTierPrices);
    expect(rows).toHaveLength(18);
    expect(rows.filter((row) => row.priceTierId === SEED_IDS.priceTiers.wholesale)).toHaveLength(12);
    expect(rows.filter((row) => row.priceTierId === SEED_IDS.priceTiers.dealer)).toHaveLength(6);
    expect(rows.filter((row) => row.priceTierId === SEED_IDS.priceTiers.retail)).toHaveLength(0);
  });

  test('seeds 5 customers', async () => {
    if (!db) return;
    const rows = await db.select().from(customers);
    expect(rows).toHaveLength(5);
  });

  test('dealerNorth is priced with the dealer tier', async () => {
    if (!db) return;
    const rows = await db.select().from(customers);
    const dealerNorth = rows.find((row) => row.id === SEED_IDS.customers.dealerNorth);
    expect(dealerNorth?.priceTierId).toBe(SEED_IDS.priceTiers.dealer);
  });
});
