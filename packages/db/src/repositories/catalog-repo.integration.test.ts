/**
 * Integration tests for the catalog and channel lookups that Tracks A and C
 * build on.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 * Every test below is a pure read, so the seed invariant stays intact.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { asOrgId, asVariantId } from '@stockhub/core';
import { createDb } from '../client';
import { SEED_IDS } from '../seed/data';
import { catalogRepo, channelRepo } from './index';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

describe.skipIf(!db)('catalog and channel lookups', () => {
  afterAll(async () => {
    if (db) await db.$client.end();
  });

  test('getVariantById returns the seeded hoe with its product name', async () => {
    if (!db) return;
    const row = await catalogRepo.getVariantById(db, {
      orgId: asOrgId(SEED_IDS.org),
      variantId: asVariantId(SEED_IDS.variants.hoe),
    });
    expect(row?.sku).toBe('HOE-001');
    expect(row?.productName.length ?? 0).toBeGreaterThan(0);
  });

  test('getVariantsByIds with an empty list returns an empty map without querying', async () => {
    if (!db) return;
    const map = await catalogRepo.getVariantsByIds(db, {
      orgId: asOrgId(SEED_IDS.org),
      variantIds: [],
    });
    expect(map.size).toBe(0);
  });

  test('getVariantsByIds resolves both seeded variants', async () => {
    if (!db) return;
    const map = await catalogRepo.getVariantsByIds(db, {
      orgId: asOrgId(SEED_IDS.org),
      variantIds: [asVariantId(SEED_IDS.variants.hoe), asVariantId(SEED_IDS.variants.spade)],
    });
    expect(map.size).toBe(2);
    expect(map.get(asVariantId(SEED_IDS.variants.spade))?.productName.length ?? 0).toBeGreaterThan(
      0,
    );
  });

  test('searchCatalog finds the hoe by its Thai product name', async () => {
    if (!db) return;
    const rows = await catalogRepo.searchCatalog(db, {
      orgId: asOrgId(SEED_IDS.org),
      q: 'จอบ',
      limit: 5,
    });
    expect(rows.map((row) => row.sku)).toContain('HOE-001');
  });

  test('getChannelByKind returns the seeded POS channel', async () => {
    if (!db) return;
    const channel = await channelRepo.getChannelByKind(db, {
      orgId: asOrgId(SEED_IDS.org),
      kind: 'pos',
    });
    expect(channel?.id).toBe(SEED_IDS.channels.pos);
  });
});
