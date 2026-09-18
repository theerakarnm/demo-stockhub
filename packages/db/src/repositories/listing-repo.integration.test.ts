/**
 * Integration tests for the learned-listing repository.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips. Every test runs inside one transaction that is rolled back by
 * throwing a sentinel, so the seed stays byte-for-byte identical.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { asChannelId, asOrgId, asVariantId, expandBundles, matchSku } from '@stockhub/core';
import type { DbTransaction } from '../client';
import { createDb } from '../client';
import { SEED_IDS } from '../seed/data';
import { buildMatchIndex, getBundleComponentMap } from './catalog-repo';
import { listListings, rematchOpenLines, upsertListing } from './listing-repo';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

class Rollback extends Error {}

/** Run the body in a transaction, then undo everything it touched. */
const inRollback = async (fn: (tx: DbTransaction) => Promise<void>): Promise<void> => {
  if (!db) return;
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
};

describe.skipIf(!db)('listing repo', () => {
  afterAll(async () => {
    if (db) await db.$client.end();
  });

  const orgId = asOrgId(SEED_IDS.org);
  const lazadaMain = asChannelId(SEED_IDS.channels.lazadaMain);
  const tiktokLive = asChannelId(SEED_IDS.channels.tiktokLive);

  test('upserting the same (channel, platform SKU) twice keeps one manual row', async () => {
    if (!db) return;
    await inRollback(async (tx) => {
      await upsertListing(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        platformProductName: 'หมวกชาวไร่ ปีกกว้าง ไซส์ XL',
        variantId: asVariantId(SEED_IDS.variants.hat),
        matchSource: 'manual',
      });
      await upsertListing(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: asVariantId(SEED_IDS.variants.hat),
        matchSource: 'manual',
      });

      const rows = (await listListings(tx, { orgId, channelId: lazadaMain })).filter(
        (row) => row.platformSku === 'LZD-NEW-HAT-XL',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.variantId).toBe(SEED_IDS.variants.hat);
      expect(rows[0]?.matchSource).toBe('manual');
    });
  });

  test('rematchOpenLines back-fills the seeded unmatched Lazada line', async () => {
    if (!db) return;
    await inRollback(async (tx) => {
      const updated = await rematchOpenLines(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: asVariantId(SEED_IDS.variants.hat),
      });
      expect(updated).toBe(1);
    });
  });

  test('a saved listing makes the next import match by itself', async () => {
    if (!db) return;
    await inRollback(async (tx) => {
      await upsertListing(tx, {
        orgId,
        channelId: lazadaMain,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: asVariantId(SEED_IDS.variants.hat),
        matchSource: 'manual',
      });

      const index = await buildMatchIndex(tx, { orgId });
      const result = matchSku(lazadaMain, 'LZD-NEW-HAT-XL', index);
      expect(result.source).toBe('listing_map');
      expect(result.variantId).toBe(asVariantId(SEED_IDS.variants.hat));
    });
  });

  test('a bundle listing matches and one set expands into its component lines', async () => {
    if (!db) return;
    await inRollback(async (tx) => {
      const index = await buildMatchIndex(tx, { orgId });
      const result = matchSku(tiktokLive, 'TT-LIVE-SET-WATER', index);
      expect(result.source).toBe('listing_map');
      expect(result.variantId).toBe(asVariantId(SEED_IDS.variants.bundleWater));
      const bundleVariantId = result.variantId;
      if (!bundleVariantId) return;

      const recipe = await getBundleComponentMap(tx, { orgId });
      const expanded = expandBundles([{ variantId: bundleVariantId, qty: 1 }], recipe);
      const bySku = new Map(expanded.map((line) => [line.variantId, line.qty]));
      expect(expanded).toHaveLength(3);
      expect(bySku.get(asVariantId(SEED_IDS.variants.hose))).toBe(1);
      expect(bySku.get(asVariantId(SEED_IDS.variants.nozzle))).toBe(1);
      expect(bySku.get(asVariantId(SEED_IDS.variants.conn))).toBe(2);
    });
  });
});
