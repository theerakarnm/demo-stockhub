/**
 * Route tests - `bun test` from apps/api.
 *
 * What these tests protect:
 *   1. the app boots and /health answers with no database and no auth
 *   2. the error envelope shape and its status mapping
 *   3. THE HEADLINE FEATURE: the same route returns cost fields to `owner` and
 *      returns the same payload WITHOUT them to `sales`
 *
 * The inventory / variant / movement assertions moved to routes/inventory.test.ts,
 * which runs against the seeded database and skips without DATABASE_URL. The
 * tests here still run on the MOCK data in src/lib/mock-data.ts on purpose:
 * dashboard and orders keep rendering while their real queries are unbuilt.
 */

import { describe, expect, test } from 'bun:test';
import { app } from './index';
import { asRole, jsonAs, requestAs, testEnv } from './test-utils';

describe('health', () => {
  test('answers without auth or a database', async () => {
    const res = await app.request('/health', {}, testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string; time: string };
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.0.0-test');
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  test('echoes a request id header', async () => {
    const res = await app.request('/health', { headers: { 'x-request-id': 'req_42' } }, testEnv);
    expect(res.headers.get('x-request-id')).toBe('req_42');
  });
});

describe('me', () => {
  test('owner holds cost:read, sales does not', async () => {
    const owner = await jsonAs<{ role: string; permissions: string[] }>(app, '/api/v1/me', 'owner');
    const sales = await jsonAs<{ role: string; permissions: string[] }>(app, '/api/v1/me', 'sales');
    expect(owner.role).toBe('owner');
    expect(owner.permissions).toContain('cost:read');
    expect(sales.permissions).not.toContain('cost:read');
  });

  test('rejects an unknown role with the error envelope', async () => {
    // requestAs is typed with a valid Role, so the bogus role goes in the raw header.
    const res = await requestAs(app, '/api/v1/me', 'owner', {
      headers: { 'x-demo-role': 'ceo' },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
  });
});

describe('cost hiding (the demo headline)', () => {
  test('dashboard hides stockValue from sales', async () => {
    type Summary = { totalSkus: number; stockValue?: number; byChannel: unknown[] };
    const owner = await jsonAs<Summary>(app, '/api/v1/dashboard/summary', 'owner');
    const sales = await jsonAs<Summary>(app, '/api/v1/dashboard/summary', 'sales');

    expect(owner.stockValue).toBeGreaterThan(0);
    expect(sales.totalSkus).toBe(owner.totalSkus);
    expect('stockValue' in sales).toBe(false);
  });

  test('orders keep cogs for manager and lose it for sales', async () => {
    type O = { id: string; grandTotal: number; cogs?: number; lines: { totalCost?: number }[] };
    const manager = await jsonAs<{ items: O[] }>(app, '/api/v1/orders', 'manager');
    const sales = await jsonAs<{ items: O[] }>(app, '/api/v1/orders', 'sales');

    expect(manager.items[0]?.cogs).toBeGreaterThan(0);
    expect(sales.items[0]?.grandTotal).toBe(manager.items[0]?.grandTotal as number);
    expect(sales.items[0] && 'cogs' in sales.items[0]).toBe(false);
    const firstLine = sales.items[0]?.lines[0];
    expect(firstLine && 'totalCost' in firstLine).toBe(false);
  });
});

describe('permissions', () => {
  test('the COGS report is blocked for sales and allowed for owner', async () => {
    const denied = await requestAs(
      app,
      '/api/v1/reports/cogs?from=2025-01-01&to=2025-01-31',
      'sales',
    );
    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { error: { code: string; details?: unknown } };
    expect(body.error.code).toBe('forbidden');

    const allowed = await requestAs(
      app,
      '/api/v1/reports/cogs?from=2025-01-01&to=2025-01-31',
      'owner',
    );
    expect(allowed.status).toBe(200);
    const report = (await allowed.json()) as { totals: { cogs?: number } };
    expect(report.totals.cogs).toBeGreaterThan(0);
  });

  test('an invalid date range fails validation', async () => {
    const res = await requestAs(app, '/api/v1/reports/cogs?from=2025-02-01&to=2025-01-01', 'owner');
    expect(res.status).toBe(400);
  });
});

describe('unfinished paths fail honestly', () => {
  test('creating a POS bill returns 501 not_implemented, not a fake success', async () => {
    const res = await app.request(
      '/api/v1/orders',
      {
        method: 'POST',
        headers: { ...asRole('sales').headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          channelKind: 'pos',
          customerName: 'ลูกค้าหน้าร้าน',
          lines: [{ variantId: 'var_hoe_std', quantity: 1 }],
        }),
      },
      testEnv,
    );
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_implemented');
  });

  test('an unknown path uses the error envelope', async () => {
    const res = await requestAs(app, '/api/v1/nope', 'owner');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
    // A stub router mounted with no routes yet must 404 too, not answer empty.
    const stub = await requestAs(app, '/api/v1/customers/nope', 'owner');
    expect(stub.status).toBe(404);
  });
});
