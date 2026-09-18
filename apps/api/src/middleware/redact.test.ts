/**
 * Tests for the automatic response redaction middleware.
 *
 * The route below answers through a raw c.json() on purpose: the whole point
 * of the middleware is that even a handler that forgets ok() ships a filtered
 * payload. The error route proves the envelope is left alone, because it
 * carries no business fields.
 */

import { describe, expect, test } from 'bun:test';
import { StockHubError } from '@stockhub/core';
import { buildTestApp, jsonAs, requestAs } from '../test-utils';

const app = buildTestApp((v1) =>
  v1
    .get('/leak', (c) =>
      c.json({ sku: 'a', unitCost: 5, priceTierId: 't', lines: [{ totalCost: 1, qty: 2 }] }),
    )
    .get('/err', () => {
      throw new StockHubError('not_found', 'x');
    }),
);

type Leak = { sku: string; lines: { qty?: number; totalCost?: number }[] };

describe('redactMiddleware', () => {
  test('owner receives every key untouched', async () => {
    const body = await jsonAs<Record<string, unknown>>(app, '/api/v1/leak', 'owner');
    expect(body).toEqual({
      sku: 'a',
      unitCost: 5,
      priceTierId: 't',
      lines: [{ totalCost: 1, qty: 2 }],
    });
  });

  test('sales keeps sku, tier id and line qty only', async () => {
    const body = await jsonAs<Leak & Record<string, unknown>>(app, '/api/v1/leak', 'sales');
    expect(body).toEqual({ sku: 'a', priceTierId: 't', lines: [{ qty: 2 }] });
  });

  test('stock_staff keeps sku and line qty only', async () => {
    const body = await jsonAs<Leak & Record<string, unknown>>(app, '/api/v1/leak', 'stock_staff');
    expect(body).toEqual({ sku: 'a', lines: [{ qty: 2 }] });
  });

  test('error envelopes pass through unredacted', async () => {
    const res = await requestAs(app, '/api/v1/err', 'sales');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  test('the rewritten body parses, with the stale content-length gone', async () => {
    const res = await requestAs(app, '/api/v1/leak', 'sales');
    expect(res.headers.get('content-length')).toBeNull();
    // A stale header would make the client read a truncated body; text() then
    // fails to parse, which is the failure mode this guards.
    const text = await res.text();
    expect(JSON.parse(text)).toBeTruthy();
  });
});
