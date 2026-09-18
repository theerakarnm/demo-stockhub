/**
 * Listing repository integration tests against the seeded database.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 *
 * Every test runs inside ONE transaction that is thrown away with a sentinel
 * error, so the seed is never actually modified: the unmatched Lazada line and
 * its empty listing slot stay reusable for the demo and the other suites.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { asChannelId, asOrgId, asVariantId, expandBundles, matchSku } from '@stockhub/core';
import { sql } from 'drizzle-orm';
import { type DbTransaction, createDb } from '../client';
import { SEED_IDS } from '../seed/data';
import { catalogRepo, listingRepo } from './index';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

/** Sentinel that ends a test transaction: thrown on purpose, never a failure. */
class Rollback extends Error {}

const orgId = asOrgId(SEED_IDS.org);
const lazadaMain = asChannelId(SEED_IDS.channels.lazadaMain);
const tiktokLive = asChannelId(SEED_IDS.channels.tiktokLive);
const hat = asVariantId(SEED_IDS.variants.hat);

/** Run `fn` in a transaction, then roll everything back. */
const rollbackAfter = async (fn: (tx: DbTransaction) => Promise<void>): Promise<void> => {
  if (!db) throw new Error('DATABASE_URL is not set');
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
};

describe.skipIf(!db)('listing repository (rolled back)', () => {
  afterAll(async () => {
    if (!db) return;
    // The transactions above already rolled back, so this is a no-op unless a
    // rollback ever breaks. Resetting keeps the seed's work queue reusable.
    await db.execute(
      sql`update order_lines set variant_id = null, match_source = 'unmatched' where id = '14000000-0000-4000-8000-000000000004'`,
    );
    await db.$client.end();
  });

  test('upsertListing is idempotent on (channelId, platformSku)', async () => {
    if (!db) return;
    await rollbackAfter(async (tx) => {
      const first = await listingRepo.upsertListing(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        platformProductName: 'หมวกชาวไร่ ปีกกว้าง ไซส์ XL',
        variantId: hat,
        matchSource: 'manual',
      });
      const second = await listingRepo.upsertListing(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: hat,
        matchSource: 'manual',
      });
      expect(second.id).toBe(first.id);
      expect(second.matchSource).toBe('manual');
      const rows = await listingRepo.listListings(tx, { orgId, channelId: lazadaMain });
      const saved = rows.filter((row) => row.platformSku === 'LZD-NEW-HAT-XL');
      expect(saved).toHaveLength(1);
      expect(saved[0]?.variantId).toBe(hat);
      // Without the channel filter every seeded listing is listed too.
      const all = await listingRepo.listListings(tx, { orgId });
      expect(all.length).toBeGreaterThan(rows.length);
    });
  });

  test('rematchOpenLines flips exactly the seed unmatched line', async () => {
    if (!db) return;
    await rollbackAfter(async (tx) => {
      await listingRepo.upsertListing(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: hat,
        matchSource: 'manual',
      });
      const updated = await listingRepo.rematchOpenLines(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: hat,
      });
      expect(updated).toBe(1);
      // Running it again flips nothing: the line is no longer unmatched.
      const again = await listingRepo.rematchOpenLines(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: hat,
      });
      expect(again).toBe(0);
    });
  });

  test('a saved listing makes matchSku resolve via listing_map', async () => {
    if (!db) return;
    await rollbackAfter(async (tx) => {
      await listingRepo.upsertListing(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: hat,
        matchSource: 'manual',
      });
      const index = await catalogRepo.buildMatchIndex(tx, { orgId });
      const result = matchSku(lazadaMain, 'LZD-NEW-HAT-XL', index);
      expect(result.source).toBe('listing_map');
      expect(result.variantId).toBe(hat);
      expect(result.suggestions).toEqual([]);
    });
  });

  test('the seeded bundle listing matches and expands to its components', async () => {
    if (!db) return;
    await rollbackAfter(async (tx) => {
      const index = await catalogRepo.buildMatchIndex(tx, { orgId });
      const result = matchSku(tiktokLive, 'TT-LIVE-SET-WATER', index);
      expect(result.source).toBe('listing_map');
      const bundleId = result.variantId;
      expect(bundleId).toBe(asVariantId(SEED_IDS.variants.bundleWater));
      if (!bundleId) return;

      // 1 set sold -> several pieces deducted, which is the point of bundles.
      const components = await catalogRepo.getBundleComponentMap(tx, { orgId });
      const expanded = expandBundles([{ variantId: bundleId, qty: 1 }], components);
      expect(expanded).toHaveLength(3);
      const qtyByVariant = new Map(expanded.map((line) => [line.variantId, line.qty]));
      expect(qtyByVariant.get(asVariantId(SEED_IDS.variants.hose))).toBe(1);
      expect(qtyByVariant.get(asVariantId(SEED_IDS.variants.nozzle))).toBe(1);
      expect(qtyByVariant.get(asVariantId(SEED_IDS.variants.conn))).toBe(2);
    });
  });
});
