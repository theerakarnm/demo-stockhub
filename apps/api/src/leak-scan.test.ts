// Route leak scan.
//
// Walks every 200 JSON response of the GET paths below, for the roles that
// must not see cost or tier data, and fails if any key blocked for that role
// survives anywhere in the payload. The path tables are exported so Track P
// can append the routes it adds.

import { describe, expect, test } from 'bun:test';
import type { Role } from '@stockhub/core';
import { blockedKeysFor } from '@stockhub/core';
import { SEED_IDS } from '@stockhub/db';
import { app } from './index';
import { requestAs } from './test-utils';

/** GET paths answerable without a database (auth context or MOCK data). */
// biome-ignore lint/suspicious/noExportsInTest: Track P appends its new routes to this table.
export const LEAK_SCAN_PATHS: readonly string[] = [
  '/api/v1/me',
  '/api/v1/channels',
  '/api/v1/dashboard/summary',
  '/api/v1/imports',
  '/api/v1/imports/batch_2001',
  '/api/v1/reports/cogs?from=2025-01-01&to=2025-01-31',
];

/** GET paths backed by real tables; they only answer 200 on a seeded database. */
// biome-ignore lint/suspicious/noExportsInTest: Track P appends its new routes to this table.
export const LEAK_SCAN_DB_PATHS: readonly string[] = [
  '/api/v1/inventory',
  `/api/v1/inventory/${SEED_IDS.variants.hoe}`,
  '/api/v1/movements',
  '/api/v1/orders',
];

/** The roles whose blocked keys must never appear in a shared payload. */
// biome-ignore lint/suspicious/noExportsInTest: Track P reuses this role list for its scan.
export const LEAK_SCAN_ROLES: readonly Role[] = ['sales', 'stock_staff'];

/** Recursively fail on any key that the role's policy blocks, at any depth. */
const expectNoBlockedKeys = (value: unknown, blocked: ReadonlySet<string>, path: string): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectNoBlockedKeys(item, blocked, `${path}[${index}]`));
    return;
  }
  if (value instanceof Date || value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    expect(blocked.has(key), `${path}: key "${key}" is blocked for this role`).toBe(false);
    expectNoBlockedKeys(child, blocked, `${path}.${key}`);
  }
};

/** Request each path as the role and scan every 200 body for blocked keys. */
const scanPaths = async (role: Role, paths: readonly string[]): Promise<void> => {
  const blocked = blockedKeysFor(role);
  for (const path of paths) {
    const res = await requestAs(app, path, role);
    // A non-200 is a permission wall or an absent database; error envelopes
    // carry no business fields, so only 200 bodies get walked.
    if (res.status !== 200) continue;
    const body: unknown = await res.json();
    expectNoBlockedKeys(body, blocked, path);
  }
};

describe('route leak scan (no database needed)', () => {
  test('every mock-data path is clean for sales and stock_staff', async () => {
    for (const role of LEAK_SCAN_ROLES) await scanPaths(role, LEAK_SCAN_PATHS);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('route leak scan (db-backed paths)', () => {
  test('every db-backed path is clean for sales and stock_staff', async () => {
    for (const role of LEAK_SCAN_ROLES) await scanPaths(role, LEAK_SCAN_DB_PATHS);
  });
});
