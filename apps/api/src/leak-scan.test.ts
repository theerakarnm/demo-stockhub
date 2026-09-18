/**
 * Route leak scan: every GET path below is fetched as each limited role, and
 * the JSON body is walked key by key to prove no key the role may not see
 * appears anywhere. This is the net under contract-audit.test.ts: even a route
 * that forgot its contract marker cannot leak past this walk.
 *
 * The table is exported so Track P can append the Wave 2 routes without
 * touching the walk logic. Routes that query Postgres carry needsDb, and their
 * half of the suite skips without DATABASE_URL, mirroring the other DB suites:
 * a skip here means untested, never pass.
 */

import { describe, expect, test } from 'bun:test';
import type { Role } from '@stockhub/core';
import { blockedKeysFor } from '@stockhub/core';
import { SEED_IDS } from '@stockhub/db';
import { app } from './index';
import { requestAs } from './test-utils';

// biome-ignore lint/suspicious/noExportsInTest: the table is the plan's extension point, Track P appends to it.
export interface LeakScanRoute {
  path: string;
  /** True when the route queries Postgres, so scanning it needs DATABASE_URL. */
  needsDb: boolean;
}

/**
 * GET paths that exist at this commit. The import preview id is mock data; the
 * variant id comes from the seed. Track P: append your routes here and keep
 * needsDb truthful, because that flag is what makes a skip meaningful.
 */
// biome-ignore lint/suspicious/noExportsInTest: the table is the plan's extension point, Track P appends to it.
export const LEAK_SCAN_ROUTES: readonly LeakScanRoute[] = [
  { path: '/api/v1/me', needsDb: false },
  { path: '/api/v1/channels', needsDb: false },
  { path: '/api/v1/dashboard/summary', needsDb: false },
  { path: '/api/v1/inventory', needsDb: true },
  { path: `/api/v1/inventory/${SEED_IDS.variants.hoe}`, needsDb: true },
  { path: '/api/v1/movements', needsDb: true },
  { path: '/api/v1/orders', needsDb: true },
  { path: '/api/v1/imports', needsDb: false },
  { path: '/api/v1/imports/batch_2001', needsDb: false },
  { path: '/api/v1/reports/cogs?from=2025-01-01&to=2025-01-31', needsDb: false },
];

/** The two roles that must never see cost or tier data. */
// biome-ignore lint/suspicious/noExportsInTest: the table is the plan's extension point, Track P appends to it.
export const LEAK_SCAN_ROLES = ['sales', 'stock_staff'] as const satisfies readonly Role[];

/** Collect every object key appearing anywhere in a decoded JSON body. */
const collectKeys = (value: unknown, out: Set<string> = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out.add(key);
      collectKeys(item, out);
    }
  }
  return out;
};

const leakScanTest = (route: LeakScanRoute, role: Role): void => {
  test(`GET ${route.path} as ${role} leaks no blocked key`, async () => {
    const res = await requestAs(app, route.path, role);
    // A 403 is an honest "the whole route is blocked", which is also safe.
    // Anything else means the route itself is broken and must fail the scan.
    expect([200, 403]).toContain(res.status);
    if (res.status !== 200) return;
    const body: unknown = await res.json();
    const blocked = blockedKeysFor(role);
    const leaked = [...collectKeys(body)].filter((key) => blocked.has(key));
    expect(leaked).toEqual([]);
  });
};

describe('leak scan - mock-backed routes', () => {
  for (const route of LEAK_SCAN_ROUTES) {
    if (route.needsDb) continue;
    for (const role of LEAK_SCAN_ROLES) leakScanTest(route, role);
  }
});

describe.skipIf(!process.env.DATABASE_URL)('leak scan - database-backed routes', () => {
  for (const route of LEAK_SCAN_ROUTES) {
    if (!route.needsDb) continue;
    for (const role of LEAK_SCAN_ROLES) leakScanTest(route, role);
  }
});
