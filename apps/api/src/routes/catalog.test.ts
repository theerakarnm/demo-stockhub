/**
 * Catalog search and listing endpoint tests against the seeded database.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips, so `bun test` stays green on a fresh clone with no database running.
 *
 * The suite MUTATES the seed (one channel_listings row + the unmatched Lazada
 * work-queue line), so afterAll deletes the listing and resets the line, which
 * keeps the seed reusable for the demo and the other suites.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { SEED_IDS, createDb } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import { buildTestApp, jsonAs, requestAs } from '../test-utils';
import { catalogRouter } from './catalog';
import { listingsRouter } from './listings';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const LAZADA_MAIN = SEED_IDS.channels.lazadaMain;
const HAT = SEED_IDS.variants.hat;
const PLATFORM_SKU = 'LZD-NEW-HAT-XL';

interface SearchRow {
  variantId: string;
  sku: string;
  name: string;
  kind: string;
  unit: string;
  sellingPrice: number;
  onHand: number;
}

interface SaveListingResult {
  listingId: string;
  channelId: string;
  platformSku: string;
  variantId: string;
  linesUpdated: number;
}

interface ListingView {
  id: string;
  channelId: string;
  platformSku: string;
  platformProductName: string | null;
  variantId: string | null;
  variantSku: string | null;
  matchSource: string;
}

interface ErrorWire {
  error: { code: string };
}

const app = buildTestApp((v1) =>
  v1.route('/catalog', catalogRouter).route('/listings', listingsRouter),
);

const post = (path: string, role: 'owner' | 'manager' | 'sales', body: unknown) =>
  requestAs(app, path, role, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const saveHatListing = (role: 'owner' | 'manager' | 'sales') =>
  jsonAs<SaveListingResult>(app, '/api/v1/listings', role, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      channelId: LAZADA_MAIN,
      platformSku: PLATFORM_SKU,
      platformProductName: 'หมวกชาวไร่ ปีกกว้าง ไซส์ XL',
      variantId: HAT,
    }),
  });

describe.skipIf(!url)('catalog and listing routes (seeded database)', () => {
  afterAll(async () => {
    if (!db) return;
    await db.execute(
      sql`delete from channel_listings where channel_id = ${LAZADA_MAIN} and platform_sku = ${PLATFORM_SKU}`,
    );
    await db.execute(
      sql`update order_lines set variant_id = null, match_source = 'unmatched' where id = '14000000-0000-4000-8000-000000000004'`,
    );
    await db.$client.end();
  });

  test('search finds the three fertilizer variants by their Thai name, sorted by sku', async () => {
    const q = encodeURIComponent('ปุ๋ย');
    const rows = await jsonAs<SearchRow[]>(app, `/api/v1/catalog/search?q=${q}`, 'owner');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.sku)).toEqual(['FRT-161616-25', 'FRT-161616-50', 'FRT-ORG-25']);
    expect(rows.every((row) => Number.isInteger(row.onHand) && row.onHand > 0)).toBe(true);
    expect(rows.every((row) => row.variantId.length > 0)).toBe(true);
  });

  test('an empty q is a 400 validation_error', async () => {
    const res = await requestAs(app, '/api/v1/catalog/search?q=', 'owner');
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('validation_error');
  });

  test('saving a mapping re-matches the open seed line exactly once', async () => {
    const result = await saveHatListing('manager');
    expect(result.linesUpdated).toBe(1);
    expect(result.channelId).toBe(LAZADA_MAIN);
    expect(result.variantId).toBe(HAT);
    expect(result.listingId.length).toBeGreaterThan(0);
  });

  test('saving the same mapping again updates nothing (idempotent)', async () => {
    const result = await saveHatListing('owner');
    expect(result.linesUpdated).toBe(0);
  });

  test('GET /listings returns the saved mapping with the variant sku', async () => {
    const rows = await jsonAs<ListingView[]>(
      app,
      `/api/v1/listings?channelId=${LAZADA_MAIN}`,
      'owner',
    );
    const saved = rows.find((row) => row.platformSku === PLATFORM_SKU);
    expect(saved?.variantSku).toBe('HAT-01');
    expect(saved?.variantId).toBe(HAT);
    expect(saved?.channelId).toBe(LAZADA_MAIN);
    expect(saved?.matchSource).toBe('manual');
  });

  test('stock_staff may search, but sales may not save a listing', async () => {
    const search = await requestAs(app, '/api/v1/catalog/search?q=HOE', 'stock_staff');
    expect(search.status).toBe(200);
    const res = await post('/api/v1/listings', 'sales', {
      channelId: LAZADA_MAIN,
      platformSku: 'NOT-ALLOWED',
      variantId: HAT,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('forbidden');
  });
});
