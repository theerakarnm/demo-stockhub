/**
 * Shopee adapter tests.
 *
 * detect() and parse() are both fully implemented, so nothing here is skipped:
 * these assertions are the executable spec of the Shopee parse.
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
import { shopeeAdapter } from './adapter';

const ctx = { timeZone: DEFAULT_TIME_ZONE };

describe('shopeeAdapter.detect', () => {
  test('recognises its own export with high confidence', async () => {
    const result = await shopeeAdapter.detect(loadFixture(SHOPEE_FIXTURE));
    expect(result.kind).toBe('shopee');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.reason).toContain('Shopee');
  });

  test('does not claim another marketplace export', async () => {
    for (const other of [LAZADA_FIXTURE, TIKTOK_FIXTURE]) {
      const result = await shopeeAdapter.detect(loadFixture(other));
      expect(result.confidence).toBeLessThan(0.6);
    }
  });

  test('scores an unrelated csv at zero', async () => {
    const result = await shopeeAdapter.detect(notAnExport());
    expect(result.confidence).toBe(0);
  });
});

describe('shopeeAdapter.parse', () => {
  test('parses every order in the sample export', async () => {
    const result = await shopeeAdapter.parse(loadFixture(SHOPEE_FIXTURE), ctx);

    expect(result.stats.rowsRead).toBe(5);
    expect(result.stats.ordersParsed).toBe(4);
    expect(result.stats.linesParsed).toBe(5);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);

    const ids = result.orders.map((order) => order.externalOrderId);
    expect(ids).toEqual(['260214FAKE001', '260214FAKE002', '260215FAKE003', '260215FAKE004']);
  });

  test('groups the two rows of order 260214FAKE002 into one order', async () => {
    const result = await shopeeAdapter.parse(loadFixture(SHOPEE_FIXTURE), ctx);
    const order = result.orders.find((o) => o.externalOrderId === '260214FAKE002');

    expect(order?.lines).toHaveLength(2);
    expect(order?.lines.map((line) => line.platformSku)).toEqual(['SHEAR-8IN', 'GLOVE-M']);
    expect(order?.lines[0]?.quantity).toBe(1);
    expect(order?.lines[1]?.quantity).toBe(3);
  });

  test('maps Thai statuses and Bangkok wall-clock dates', async () => {
    const result = await shopeeAdapter.parse(loadFixture(SHOPEE_FIXTURE), ctx);
    const shipped = result.orders.find((o) => o.externalOrderId === '260214FAKE001');
    const cancelled = result.orders.find((o) => o.externalOrderId === '260215FAKE004');

    expect(shipped?.status).toBe('shipped');
    expect(cancelled?.status).toBe('cancelled');
    // "2026-02-14 09:12:33" in Asia/Bangkok is 02:12:33 UTC.
    expect(shipped?.orderedAt.toISOString()).toBe('2026-02-14T02:12:33.000Z');
  });

  test('reads "฿1,890.00" as satang', async () => {
    const result = await shopeeAdapter.parse(loadFixture(SHOPEE_FIXTURE), ctx);
    const order = result.orders.find((o) => o.externalOrderId === '260215FAKE003');

    expect(order?.lines[0]?.unitPrice).toBe(satang(189_000));
    expect(order?.lines[0]?.discount).toBe(satang(9_000));
    expect(order?.grandTotal).toBe(satang(180_000));
  });

  test('keeps the source rows in `raw` for support', async () => {
    const result = await shopeeAdapter.parse(loadFixture(SHOPEE_FIXTURE), ctx);
    expect(result.orders[0]?.raw).toBeDefined();
  });
});
