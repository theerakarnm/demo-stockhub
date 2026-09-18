/**
 * Customer route tests against the seeded database.
 *
 * The suite creates customers named ร้านทดสอบ only, and afterAll deletes
 * every row with that name, so the 5 seeded customers stay untouched.
 * Without DATABASE_URL the whole suite skips, so `bun test` stays green with
 * no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { SEED_IDS, createDb } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import { buildTestApp, requestAs } from '../test-utils';
import { customersRouter } from './customers';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

/** The Customer wire shape this suite asserts on. */
interface CustomerWire {
  id: string;
  name: string;
  isActive: boolean;
  priceTierId?: string;
  priceTierCode?: string;
  priceTierName?: string;
}

/** The error envelope from middleware/error.ts. */
interface ErrorWire {
  error: { code: string; message: string };
}

const app = buildTestApp((v1) => v1.route('/customers', customersRouter));

const post = (path: string, body: unknown) =>
  requestAs(app, path, 'sales', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const patch = (path: string, body: unknown) =>
  requestAs(app, path, 'sales', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe.skipIf(!url)('customer routes (seeded database)', () => {
  let createdId = '';

  afterAll(async () => {
    if (!db) return;
    await db.execute(sql`delete from customers where name = 'ร้านทดสอบ'`);
    await db.$client.end();
  });

  test('owner lists the 5 seed customers', async () => {
    const res = await requestAs(app, '/api/v1/customers', 'owner');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items?: CustomerWire[] } | CustomerWire[];
    const items = Array.isArray(body) ? body : (body.items ?? []);
    expect(items).toHaveLength(5);
  });

  test('q=สหกรณ์ finds exactly the cooperative', async () => {
    const res = await requestAs(app, `/api/v1/customers?q=${encodeURIComponent('สหกรณ์')}`, 'owner');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items?: CustomerWire[] } | CustomerWire[];
    const items = Array.isArray(body) ? body : (body.items ?? []);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('สหกรณ์การเกษตรหนองบัว');
  });

  test('sales creates a customer with the wholesale tier', async () => {
    const res = await post('/api/v1/customers', {
      name: 'ร้านทดสอบ',
      priceTierId: SEED_IDS.priceTiers.wholesale,
    });
    expect(res.status).toBe(201);
    const customer = (await res.json()) as CustomerWire;
    expect(customer.name).toBe('ร้านทดสอบ');
    expect(customer.priceTierCode).toBe('wholesale');
    expect(customer.priceTierName).toBe('ราคาส่ง');
    createdId = customer.id;
  });

  test('patching priceTierId to null clears the tier fields', async () => {
    // CustomerInput.name is required on PATCH too (wire contract + Step 1
    // schema), so the patch body has to carry a name alongside the tier change.
    const res = await patch(`/api/v1/customers/${createdId}`, {
      name: 'ร้านทดสอบ',
      priceTierId: null,
    });
    expect(res.status).toBe(200);
  });

  test('the patched customer no longer carries tier fields', async () => {
    const res = await requestAs(app, `/api/v1/customers/${createdId}`, 'sales');
    expect(res.status).toBe(200);
    const customer = (await res.json()) as CustomerWire;
    expect('priceTierCode' in customer).toBe(false);
    expect('priceTierId' in customer).toBe(false);
  });

  test('stock_staff is forbidden and a foreign tier id is a validation error', async () => {
    const forbidden = await requestAs(app, '/api/v1/customers', 'stock_staff');
    expect(forbidden.status).toBe(403);

    const foreign = await post('/api/v1/customers', {
      name: 'ร้านทดสอบ',
      priceTierId: crypto.randomUUID(),
    });
    expect(foreign.status).toBe(400);
    const body = (await foreign.json()) as ErrorWire;
    expect(body.error.code).toBe('validation_error');
  });
});
