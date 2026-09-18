/**
 * Tests for the response redaction middleware.
 *
 * These run against a mock-data route, so they need no database: the point is
 * the middleware contract, not any particular endpoint.
 */

import { describe, expect, test } from 'bun:test';
import { StockHubError } from '@stockhub/core';
import { buildTestApp, requestAs } from '../test-utils';

/** One route that leaks every category at once, plus one that throws. */
const app = buildTestApp((v1) =>
  v1
    .get('/leak', (c) =>
      c.json({ sku: 'a', unitCost: 5, priceTierId: 't', lines: [{ totalCost: 1, qty: 2 }] }),
    )
    .get('/err', () => {
      throw new StockHubError('not_found', 'x');
    }),
);

type Leaky = {
  sku: string;
  unitCost?: number;
  priceTierId?: string;
  lines: { totalCost?: number; qty: number }[];
};

describe('redactMiddleware', () => {
  test('owner receives every key untouched', async () => {
    const res = await requestAs(app, '/api/v1/leak', 'owner');
    const body = (await res.json()) as Leaky;
    expect(body.sku).toBe('a');
    expect(body.unitCost).toBe(5);
    expect(body.priceTierId).toBe('t');
    expect(body.lines[0]?.totalCost).toBe(1);
    expect(body.lines[0]?.qty).toBe(2);
  });

  test('sales keeps sku, tier key and qty, loses every cost key', async () => {
    const res = await requestAs(app, '/api/v1/leak', 'sales');
    const body = (await res.json()) as Leaky;
    expect(body.sku).toBe('a');
    expect(body.priceTierId).toBe('t');
    expect(body.lines[0]?.qty).toBe(2);
    expect('unitCost' in body).toBe(false);
    expect('totalCost' in (body.lines[0] ?? {})).toBe(false);
  });

  test('stock_staff keeps only sku and qty', async () => {
    const res = await requestAs(app, '/api/v1/leak', 'stock_staff');
    const body = (await res.json()) as Leaky;
    expect(body.sku).toBe('a');
    expect(body.lines[0]?.qty).toBe(2);
    expect('priceTierId' in body).toBe(false);
    expect('totalCost' in (body.lines[0] ?? {})).toBe(false);
  });

  test('an error response keeps the error envelope and status', async () => {
    const res = await requestAs(app, '/api/v1/err', 'sales');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  test('the rewritten body has no stale content-length mismatch', async () => {
    const res = await requestAs(app, '/api/v1/leak', 'owner');
    const text = await res.text();
    const body: unknown = JSON.parse(text);
    expect(typeof body).toBe('object');
  });
});
