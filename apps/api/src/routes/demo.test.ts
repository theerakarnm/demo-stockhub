/**
 * POST /demo/reset route tests.
 *
 * THIS SUITE RUNS AGAINST ITS OWN DATABASE. The endpoint calls
 * `TRUNCATE ... CASCADE` over every business table, including organizations and
 * users, so pointing it at the database the other suites share would delete
 * their fixtures mid-run. Set DATABASE_URL_DEMO to a second database that has
 * been migrated:
 *
 *   podman exec stockhub-postgres createdb -U stockhub stockhub_demo
 *   DATABASE_URL=postgres://stockhub:stockhub@localhost:5435/stockhub_demo bun run db:migrate
 *
 * Without it the whole suite skips, exactly like the other DB-backed suites.
 */

import { describe, expect, test } from 'bun:test';
import type { Role } from '@stockhub/core';
import { SEED_IDS, createDb } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import type { Env } from '../env';
import { buildTestApp, requestAs, testEnv } from '../test-utils';
import type { DemoResetResult } from '../types/contract';
import { demoRouter } from './demo';

const url = process.env.DATABASE_URL_DEMO;
const db = url ? createDb(url) : undefined;

const app = buildTestApp((v1) => v1.route('/demo', demoRouter));

/** testEnv, but pointed at the throwaway database and a chosen environment. */
const envFor = (environment: string): Env => ({
  ...testEnv,
  ENVIRONMENT: environment,
  DATABASE_URL: url,
});

const reset = (role: Role, environment = 'development'): Promise<Response> =>
  requestAs(app, '/api/v1/demo/reset', role, { method: 'POST' }, envFor(environment));

describe('demo reset route', () => {
  test('owner reset restores the opening state and reports it', async () => {
    if (!db) return;

    // Dirty the database first, so a no-op would fail this test.
    await db.execute(sql`delete from stock_lots`);

    const res = await reset('owner');
    expect(res.status).toBe(200);

    const body = (await res.json()) as DemoResetResult;
    expect(body.variantCount).toBe(19);
    expect(body.lotCount).toBe(30);
    expect(body.onHand).toBe(2822);
    expect(body.stockValue).toBe(37_924_500);

    // The reported numbers must be what the database actually holds.
    const rows = (await db.execute(sql`
      select count(*)::int as lots,
             coalesce(sum(remaining_qty), 0)::int as on_hand,
             coalesce(sum(remaining_qty * unit_cost), 0)::bigint as value
      from stock_lots
      where org_id = ${SEED_IDS.org}
    `)) as Array<{ lots: number; on_hand: number; value: string }>;
    expect(rows[0]?.lots).toBe(30);
    expect(rows[0]?.on_hand).toBe(2822);
    expect(Number(rows[0]?.value)).toBe(37_924_500);
  });

  test('is a 404 outside development, not a 403', async () => {
    if (!db) return;
    for (const environment of ['staging', 'production']) {
      const res = await reset('owner', environment);
      expect(res.status).toBe(404);
    }
  });

  test('stock_staff may reset but never sees stockValue', async () => {
    if (!db) return;
    const res = await reset('stock_staff');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.onHand).toBe(2822);
    // The key must be ABSENT, not null: that is what stripCost() does.
    expect('stockValue' in body).toBe(false);
  });

  test('sales has no stock:adjust and is refused', async () => {
    if (!db) return;
    const res = await reset('sales');
    expect(res.status).toBe(403);
  });
});
