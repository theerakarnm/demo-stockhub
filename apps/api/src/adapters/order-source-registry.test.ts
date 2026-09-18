/**
 * The API adapter seam, now backed by @stockhub/adapters.
 *
 * The Shopee fixture is read by bytes with node:fs at the relative path from
 * this directory (apps/api/src/adapters, four levels up to the repo root),
 * resolved against import.meta.dir so the test does not depend on the process
 * CWD. The negative case mirrors notAnExport() from
 * packages/adapters/src/test-helpers.ts: a two-column shopping list that no
 * marketplace claims (that helper is test-only and lives outside this
 * package's rootDir, so it cannot be imported here directly).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StockHubError } from '@stockhub/core';
import type { RawImportFile } from '@stockhub/core';
import { adapterForKind, detectAdapter } from './order-source-registry';

const SHOPEE_FIXTURE_RELPATH = '../../../../packages/adapters/fixtures/shopee-orders.sample.csv';

const shopeeFixture = (): RawImportFile => ({
  fileName: 'shopee-orders.sample.csv',
  // The same MIME the package's loadFixture reports, matching a real upload.
  contentType: 'application/vnd.ms-excel',
  bytes: new Uint8Array(readFileSync(join(import.meta.dir, SHOPEE_FIXTURE_RELPATH))),
});

/** Mirrors notAnExport() in packages/adapters/src/test-helpers.ts. */
const notAnExport = (): RawImportFile => ({
  fileName: 'shopping-list.csv',
  contentType: 'text/csv',
  bytes: new TextEncoder().encode('name,note\nกาแฟ,ซื้อพรุ่งนี้\nน้ำตาล,เหลือครึ่งถุง\n'),
});

describe('order-source-registry (wired to @stockhub/adapters)', () => {
  test('detects the Shopee sample export as shopee', async () => {
    const detected = await detectAdapter(shopeeFixture());
    expect(detected.adapter.kind).toBe('shopee');
    expect(detected.detection.reason.length).toBeGreaterThan(0);
  });

  test('throws validation_error for a file no marketplace claims', async () => {
    try {
      await detectAdapter(notAnExport());
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(StockHubError);
      if (!(error instanceof StockHubError)) throw error;
      expect(error.code).toBe('validation_error');
    }
  });

  test('adapterForKind returns the lazada adapter by kind', () => {
    expect(adapterForKind('lazada').kind).toBe('lazada');
  });

  test('adapterForKind throws for an unknown kind', () => {
    expect(() => adapterForKind('ebay')).toThrow(StockHubError);
  });
});
