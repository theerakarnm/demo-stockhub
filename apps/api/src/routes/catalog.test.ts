/**
 * Catalog search + listing route tests against the seeded database.
 *
 * The save test is the only one that writes. Its afterAll deletes the created
 * listing and resets the seeded unmatched line, so the seed stays valid for
 * the next run. Without DATABASE_URL the whole suite skips.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { SEED_IDS, createDb } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import { app } from '../index';
import { jsonAs, requestAs } from '../test-utils';
import type { CatalogSearchRow, ListingView, SaveListingResult } from '../types/contract-catalog';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const LAZADA_MAIN = SEED_IDS.channels.lazadaMain;
const UNMATCHED_LINE_ID = '14000000-0000-4000-8000-000000000004';

describe.skipIf(!url)('catalog and listing routes (seeded database)', () => {
  afterAll(async () => {
    if (!db) return;
    // Undo the save test: the listing row goes away, the seeded unmatched line
    // returns to exactly the state the seed wrote.
    await db.execute(
      sql`delete from channel_listings where channel_id = ${LAZADA_MAIN} and platform_sku = 'LZD-NEW-HAT-XL'`,
    );
    await db.execute(
      sql`update order_lines set variant_id = null, match_source = 'unmatched' where id = ${UNMATCHED_LINE_ID}`,
    );
    await db.$client.end();
  });

  test('search finds the fertilizer variants by their Thai product name', async () => {
    const rows = await jsonAs<CatalogSearchRow[]>(
      app,
      // Built with encodeURIComponent so the combining tone mark survives any
      // editor or transport that would otherwise normalise the literal.
      `/api/v1/catalog/search?q=${encodeURIComponent('ปุ๋ย')}`,
      'owner',
    );
    expect(rows.map((row) => row.sku)).toEqual(['FRT-161616-25', 'FRT-161616-50', 'FRT-ORG-25']);
    for (const row of rows) expect(typeof row.onHand).toBe('number');
  });

  test('an empty query is a 400, not a full-catalog dump', async () => {
    const res = await requestAs(app, '/api/v1/catalog/search?q=', 'owner');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
  });

  test('saving a listing back-fills the open line once, then is idempotent', async () => {
    const body = {
      channelId: LAZADA_MAIN,
      platformSku: 'LZD-NEW-HAT-XL',
      platformProductName: 'หมวกชาวไร่ ปีกกว้าง ไซส์ XL',
      variantId: SEED_IDS.variants.hat,
    };
    const first = await jsonAs<SaveListingResult>(app, '/api/v1/listings', 'stock_staff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(first.linesUpdated).toBe(1);
    expect(first.variantId).toBe(SEED_IDS.variants.hat);

    const second = await jsonAs<SaveListingResult>(app, '/api/v1/listings', 'stock_staff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(second.linesUpdated).toBe(0);
  });

  test('the saved listing shows up with the variant SKU resolved', async () => {
    const rows = await jsonAs<ListingView[]>(
      app,
      `/api/v1/listings?channelId=${LAZADA_MAIN}`,
      'owner',
    );
    const saved = rows.find((row) => row.platformSku === 'LZD-NEW-HAT-XL');
    expect(saved?.variantId).toBe(SEED_IDS.variants.hat);
    expect(saved?.variantSku).toBe('HAT-01');
    expect(saved?.matchSource).toBe('manual');
  });

  test('stock_staff may search the catalog', async () => {
    const res = await requestAs(app, '/api/v1/catalog/search?q=HOE', 'stock_staff');
    expect(res.status).toBe(200);
  });

  test('sales may not save a listing', async () => {
    const res = await requestAs(app, '/api/v1/listings', 'sales', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId: LAZADA_MAIN,
        platformSku: 'LZD-NEW-HAT-XL',
        variantId: SEED_IDS.variants.hat,
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('forbidden');
  });
});
