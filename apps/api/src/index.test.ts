/**
 * Route tests - `bun test` from apps/api.
 *
 * What these tests protect:
 *   1. the app boots and /health answers with no database and no auth
 *   2. the error envelope shape and its status mapping
 *   3. THE HEADLINE FEATURE: the same route returns cost fields to `owner` and
 *      returns the same payload WITHOUT them to `sales`
 *
 * They run against the MOCK data in src/lib/mock-data.ts on purpose: they must
 * keep passing while packages/db is still being built.
 */

import { describe, expect, test } from 'bun:test';
import type { Env } from './env';
import { app } from './index';

/** Fake bindings. R2 is never touched by a mock route, hence the cast. */
const testEnv = {
  ENVIRONMENT: 'test',
  API_VERSION: '0.0.0-test',
  CORS_ORIGINS: 'http://localhost:3000',
  DEMO_MODE: 'true',
  IMPORTS_BUCKET: undefined as unknown as R2Bucket,
} satisfies Env;

const asRole = (role: string) => ({
  headers: { 'x-demo-role': role, 'x-demo-org': 'org_demo' },
});

const get = (path: string, role: string) => app.request(path, asRole(role), testEnv);

const json = async <T>(path: string, role: string): Promise<T> => {
  const res = await get(path, role);
  return (await res.json()) as T;
};

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
    const owner = await json<{ role: string; permissions: string[] }>('/api/v1/me', 'owner');
    const sales = await json<{ role: string; permissions: string[] }>('/api/v1/me', 'sales');
    expect(owner.role).toBe('owner');
    expect(owner.permissions).toContain('cost:read');
    expect(sales.permissions).not.toContain('cost:read');
  });

  test('rejects an unknown role with the error envelope', async () => {
    const res = await get('/api/v1/me', 'ceo');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
  });
});

describe('cost hiding (the demo headline)', () => {
  test('inventory rows keep cost fields for owner and lose them for sales', async () => {
    type Row = { sku: string; onHand: number; avgUnitCost?: number; stockValue?: number };
    const owner = await json<{ items: Row[] }>('/api/v1/inventory', 'owner');
    const sales = await json<{ items: Row[] }>('/api/v1/inventory', 'sales');

    expect(owner.items.length).toBeGreaterThan(0);
    expect(sales.items.length).toBe(owner.items.length);

    const ownerRow = owner.items[0];
    const salesRow = sales.items[0];
    expect(ownerRow?.avgUnitCost).toBeGreaterThan(0);
    expect(ownerRow?.stockValue).toBeGreaterThan(0);

    // Same quantities, no cost keys at all - not null, ABSENT from the JSON.
    expect(salesRow?.onHand).toBe(ownerRow?.onHand as number);
    expect(salesRow && 'avgUnitCost' in salesRow).toBe(false);
    expect(salesRow && 'stockValue' in salesRow).toBe(false);
  });

  test('stock_staff sees quantities but no lots on the variant detail', async () => {
    type Detail = { variant: { sku: string }; onHand: number; lots?: unknown[] };
    const owner = await json<Detail>('/api/v1/inventory/var_hoe_std', 'owner');
    const staff = await json<Detail>('/api/v1/inventory/var_hoe_std', 'stock_staff');

    expect(owner.lots?.length).toBeGreaterThan(0);
    expect(staff.onHand).toBe(owner.onHand);
    expect('lots' in staff).toBe(false);
  });

  test('dashboard hides stockValue from sales', async () => {
    type Summary = { totalSkus: number; stockValue?: number; byChannel: unknown[] };
    const owner = await json<Summary>('/api/v1/dashboard/summary', 'owner');
    const sales = await json<Summary>('/api/v1/dashboard/summary', 'sales');

    expect(owner.stockValue).toBeGreaterThan(0);
    expect(sales.totalSkus).toBe(owner.totalSkus);
    expect('stockValue' in sales).toBe(false);
  });

  test('movement rows hide unitCost and totalCost from sales', async () => {
    type Mv = { id: string; qtyDelta: number; unitCost?: number; totalCost?: number };
    const owner = await json<{ items: Mv[] }>('/api/v1/movements', 'owner');
    const sales = await json<{ items: Mv[] }>('/api/v1/movements', 'sales');

    expect(owner.items[0]?.totalCost).toBeGreaterThan(0);
    expect(sales.items[0]?.qtyDelta).toBe(owner.items[0]?.qtyDelta as number);
    expect(sales.items[0] && 'unitCost' in sales.items[0]).toBe(false);
    expect(sales.items[0] && 'totalCost' in sales.items[0]).toBe(false);
  });

  test('orders keep cogs for manager and lose it for sales', async () => {
    type O = { id: string; grandTotal: number; cogs?: number; lines: { totalCost?: number }[] };
    const manager = await json<{ items: O[] }>('/api/v1/orders', 'manager');
    const sales = await json<{ items: O[] }>('/api/v1/orders', 'sales');

    expect(manager.items[0]?.cogs).toBeGreaterThan(0);
    expect(sales.items[0]?.grandTotal).toBe(manager.items[0]?.grandTotal as number);
    expect(sales.items[0] && 'cogs' in sales.items[0]).toBe(false);
    const firstLine = sales.items[0]?.lines[0];
    expect(firstLine && 'totalCost' in firstLine).toBe(false);
  });
});

describe('permissions', () => {
  test('the COGS report is blocked for sales and allowed for owner', async () => {
    const denied = await get('/api/v1/reports/cogs?from=2025-01-01&to=2025-01-31', 'sales');
    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { error: { code: string; details?: unknown } };
    expect(body.error.code).toBe('forbidden');

    const allowed = await get('/api/v1/reports/cogs?from=2025-01-01&to=2025-01-31', 'owner');
    expect(allowed.status).toBe(200);
    const report = (await allowed.json()) as { totals: { cogs?: number } };
    expect(report.totals.cogs).toBeGreaterThan(0);
  });

  test('an invalid date range fails validation', async () => {
    const res = await get('/api/v1/reports/cogs?from=2025-02-01&to=2025-01-01', 'owner');
    expect(res.status).toBe(400);
  });
});

describe('query filters on the mock data', () => {
  test('search narrows the inventory list', async () => {
    const res = await json<{ items: { sku: string }[] }>('/api/v1/inventory?q=SPR', 'owner');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.sku).toBe('SPR-5L-01');
  });

  test('lowStock=true only returns rows at or below their threshold', async () => {
    const res = await json<{ items: { sku: string }[] }>(
      '/api/v1/inventory?lowStock=true',
      'owner',
    );
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.map((row) => row.sku)).toContain('SIC-M-02');
  });

  test('movements can be filtered by reason', async () => {
    const res = await json<{ items: { reason: string }[] }>(
      '/api/v1/movements?reason=purchase_in',
      'owner',
    );
    expect(res.items.every((movement) => movement.reason === 'purchase_in')).toBe(true);
    expect(res.items.length).toBeGreaterThan(0);
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
    const res = await get('/api/v1/nope', 'owner');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});
