/**
 * Customer route tests against the seeded database.
 *
 * They need a live Postgres with the migration applied and the seed loaded
 * (`bun run db:migrate && bun run db:seed`) plus DATABASE_URL. Without
 * DATABASE_URL the whole suite skips.
 *
 * The suite writes two rows ('ร้านทดสอบ*' variants) and deletes every row it
 * may have created in `afterAll`, so the seed invariant stays intact for the
 * other suites.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { SEED_IDS, createDb } from '@stockhub/db';
import { customers } from '@stockhub/db/schema';
import { eq } from 'drizzle-orm';
import { buildTestApp, jsonAs, requestAs } from '../test-utils';
import { customersRouter } from './customers';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

describe.skipIf(!url)('customer routes (seeded database)', () => {
  const app = buildTestApp((v1) => v1.route('/customers', customersRouter));

  afterAll(async () => {
    if (!db) return;
    // Remove everything this suite created, by the marker name it used.
    await db.delete(customers).where(eq(customers.name, 'ร้านทดสอบ'));
    await db.delete(customers).where(eq(customers.name, 'ร้านทดสอบส่ง'));
    await db.$client.end();
  });

  test('owner lists the 5 seeded customers', async () => {
    const rows = await jsonAs<{ id: string; name: string }[]>(app, '/api/v1/customers', 'owner');
    expect(rows).toHaveLength(5);
  });

  test('search by Thai name narrows the list to one', async () => {
    const rows = await jsonAs<{ name: string }[]>(app, '/api/v1/customers?q=สหกรณ์', 'owner');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('สหกรณ์การเกษตรหนองบัว');
  });

  test('sales creates a wholesale customer and sees its tier code', async () => {
    const created = await jsonAs<{ id: string; priceTierCode?: string }>(
      app,
      '/api/v1/customers',
      'sales',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'ร้านทดสอบส่ง',
          priceTierId: SEED_IDS.priceTiers.wholesale,
        }),
      },
    );
    expect(created.priceTierCode).toBe('wholesale');
  });

  test('patching the tier to null removes the tier fields from the response', async () => {
    const created = await jsonAs<{ id: string }>(app, '/api/v1/customers', 'sales', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ร้านทดสอบ', priceTierId: SEED_IDS.priceTiers.wholesale }),
    });
    expect(created.id).toBeTruthy();

    const patched = await jsonAs<{ priceTierId?: string; priceTierCode?: string }>(
      app,
      `/api/v1/customers/${created.id}`,
      'sales',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priceTierId: null }),
      },
    );
    expect('priceTierId' in patched).toBe(false);
    expect('priceTierCode' in patched).toBe(false);
  });

  test('stock_staff is forbidden to read customers', async () => {
    const res = await requestAs(app, '/api/v1/customers', 'stock_staff');
    expect(res.status).toBe(403);
  });

  test('a price tier id from another org answers 400', async () => {
    const res = await requestAs(app, '/api/v1/customers', 'sales', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'ร้านองค์กรอื่น',
        priceTierId: '34800000-0000-4000-8000-000000000001',
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
  });
});
