/**
 * The four bundled demo export files.
 *
 * The guided demo's every number depends on these files behaving exactly as
 * docs/demo-walkthrough.md section C says, so this suite pins the behaviour:
 * each file detects as its platform with at least the 0.6 threshold, and the
 * parse produces the orders, statuses and issues the scenes assume.
 *
 * Files live in apps/web/public/demo-files because the browser fetches them as
 * real uploads. This test reads them by relative URL so it runs from any cwd.
 */

import { describe, expect, test } from 'bun:test';
import { detectAdapter, getAdapter } from '@stockhub/adapters';
import type { RawImportFile } from '@stockhub/core';

const fileUrl = (name: string): URL =>
  new URL(`../../../../apps/web/public/demo-files/${name}`, import.meta.url);

const load = async (name: string): Promise<RawImportFile> => ({
  fileName: name,
  contentType: 'text/csv',
  bytes: new Uint8Array(await Bun.file(fileUrl(name)).arrayBuffer()),
});

describe('demo export files', () => {
  test('each file detects as its platform above the 0.6 threshold', async () => {
    for (const [name, kind] of [
      ['shopee-demo-2026-09-19-am.csv', 'shopee'],
      ['lazada-demo-2026-09-19.csv', 'lazada'],
      ['tiktok-demo-2026-09-19.csv', 'tiktok'],
      ['shopee-demo-2026-09-19-pm.csv', 'shopee'],
    ] as const) {
      const detected = await detectAdapter(await load(name));
      expect(detected?.kind).toBe(kind);
      expect(detected?.confidence ?? 0).toBeGreaterThanOrEqual(0.6);
    }
  });

  test('shopee am parses 4 orders: 3 deductable, 1 unmatched sku, 1 cancelled', async () => {
    const file = await load('shopee-demo-2026-09-19-am.csv');
    const result = await getAdapter('shopee').parse(file, { timeZone: 'Asia/Bangkok' });

    expect(result.stats.rowsRead).toBe(6);
    expect(result.orders.map((order) => order.externalOrderId)).toEqual([
      'SPD26091901',
      'SPD26091902',
      'SPD26091903',
      'SPD26091904',
    ]);
    expect(result.orders[0]?.status).toBe('shipped');
    expect(result.orders[1]?.status).toBe('shipped');
    // The unmatched SKU must still parse as a shipped order line: the scene
    // resolves it through a manual match BEFORE applying.
    expect(result.orders[2]?.status).toBe('shipped');
    expect(result.orders[2]?.lines[0]?.platformSku).toBe('SHP-หมวก-XL');
    expect(result.orders[3]?.status).toBe('cancelled');
    expect(result.issues).toHaveLength(0);
  });

  test('shopee pm flips SPD26091901 to cancelled and nothing else', async () => {
    const file = await load('shopee-demo-2026-09-19-pm.csv');
    const result = await getAdapter('shopee').parse(file, { timeZone: 'Asia/Bangkok' });

    const byId = new Map(result.orders.map((order) => [order.externalOrderId, order]));
    expect(byId.get('SPD26091901')?.status).toBe('cancelled');
    expect(byId.get('SPD26091902')?.status).toBe('shipped');
    expect(byId.get('SPD26091903')?.status).toBe('shipped');
    expect(byId.get('SPD26091904')?.status).toBe('cancelled');
  });

  test('lazada detects as lazada and keeps the good line of the order with a bad row', async () => {
    const file = await load('lazada-demo-2026-09-19.csv');
    const detected = await detectAdapter(file);
    expect(detected?.kind).toBe('lazada');

    const result = await getAdapter('lazada').parse(file, { timeZone: 'Asia/Bangkok' });
    expect(result.orders).toHaveLength(3);
    // The row with an empty seller SKU raises missing_sku and dies ALONE. Its
    // order must survive with the blade line, or scene 7's numbers would shift.
    const lz3 = result.orders.find((order) => order.externalOrderId === 'LZD26091903');
    expect(lz3?.lines).toHaveLength(1);
    expect(lz3?.lines[0]?.platformSku).toBe('BLD-3T-255');
    expect(result.issues.map((issue) => issue.code)).toContain('missing_sku');
    // No missing_column warnings either: the file carries every standard column
    // so the demo screen never shows a yellow "column not found" box.
    expect(result.issues).toHaveLength(1);
  });

  test('tiktok detects as tiktok across the description row and keeps the bundle sku', async () => {
    const file = await load('tiktok-demo-2026-09-19.csv');
    const detected = await detectAdapter(file);
    expect(detected?.kind).toBe('tiktok');

    const result = await getAdapter('tiktok').parse(file, { timeZone: 'Asia/Bangkok' });
    expect(result.orders).toHaveLength(2);
    expect(result.orders[0]?.lines[0]?.platformSku).toBe('TT-LIVE-SET-WATER');
    expect(result.orders[0]?.lines[0]?.quantity).toBe(3);
    expect(result.orders[1]?.lines[0]?.platformSku).toBe('GLV-01');
    expect(result.issues).toHaveLength(0);
  });
});
