/**
 * TikTok Shop adapter tests.
 *
 * detect() and parse() are both fully implemented, so nothing here is skipped:
 * these assertions are the executable spec of the TikTok parse.
 */

import { describe, expect, test } from 'bun:test';
import { satang } from '@stockhub/core';
import { DEFAULT_TIME_ZONE } from '../shared/parse-values';
import {
  LAZADA_FIXTURE,
  SHOPEE_FIXTURE,
  TIKTOK_FIXTURE,
  loadFixture,
  notAnExport,
} from '../test-helpers';
import { tiktokAdapter } from './adapter';

const ctx = { timeZone: DEFAULT_TIME_ZONE };

describe('tiktokAdapter.detect', () => {
  test('recognises its own export with high confidence', async () => {
    const result = await tiktokAdapter.detect(loadFixture(TIKTOK_FIXTURE));
    expect(result.kind).toBe('tiktok');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.reason).toContain('TikTok Shop');
  });

  test('does not claim another marketplace export', async () => {
    for (const other of [SHOPEE_FIXTURE, LAZADA_FIXTURE]) {
      const result = await tiktokAdapter.detect(loadFixture(other));
      expect(result.confidence).toBeLessThan(0.6);
    }
  });

  test('scores an unrelated csv at zero', async () => {
    const result = await tiktokAdapter.detect(notAnExport());
    expect(result.confidence).toBe(0);
  });
});

describe('tiktokAdapter.parse', () => {
  test('skips the description row and parses every order', async () => {
    const result = await tiktokAdapter.parse(loadFixture(TIKTOK_FIXTURE), ctx);

    // 4 data rows, because the description row under the header is not data.
    expect(result.stats.rowsRead).toBe(4);
    expect(result.stats.ordersParsed).toBe(3);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
  });

  test('groups the two rows of order ...002 into one order', async () => {
    const result = await tiktokAdapter.parse(loadFixture(TIKTOK_FIXTURE), ctx);
    const order = result.orders.find((o) => o.externalOrderId === '577000000000000002');

    expect(order?.lines).toHaveLength(2);
    expect(order?.lines.map((line) => line.platformSku)).toEqual(['MACHETE-01', 'WCAN-5L']);
    expect(order?.lines[0]?.quantity).toBe(2);
  });

  test('keeps the 19 digit order id as text', async () => {
    const result = await tiktokAdapter.parse(loadFixture(TIKTOK_FIXTURE), ctx);
    expect(result.orders.map((order) => order.externalOrderId)).toContain('577000000000000001');
  });

  test('parses day-first dates as Bangkok wall clock', async () => {
    const result = await tiktokAdapter.parse(loadFixture(TIKTOK_FIXTURE), ctx);
    const order = result.orders.find((o) => o.externalOrderId === '577000000000000001');

    // "14/02/2026 09:30:00" in Asia/Bangkok is 02:30:00 UTC.
    expect(order?.orderedAt.toISOString()).toBe('2026-02-14T02:30:00.000Z');
    expect(order?.status).toBe('delivered');
  });

  test('reads the seller discount, not the platform discount', async () => {
    const result = await tiktokAdapter.parse(loadFixture(TIKTOK_FIXTURE), ctx);
    const order = result.orders.find((o) => o.externalOrderId === '577000000000000002');

    expect(order?.lines[0]?.unitPrice).toBe(satang(32_000));
    expect(order?.lines[0]?.discount).toBe(satang(4_000));
  });
});
