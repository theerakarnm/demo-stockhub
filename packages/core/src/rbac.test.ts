import { describe, expect, test } from 'bun:test';
import { ROLES } from './domain/enums';
import {
  COST_KEYS,
  FIELD_POLICIES,
  PERMISSIONS,
  can,
  permissionsOf,
  redactForRole,
  stripCost,
} from './rbac';

describe('role matrix', () => {
  test('owner holds every permission', () => {
    for (const permission of PERMISSIONS) expect(can('owner', permission)).toBe(true);
  });
  test('stock_staff never sees cost or tier data', () => {
    expect(can('stock_staff', 'cost:read')).toBe(false);
    expect(can('stock_staff', 'price_tier:read')).toBe(false);
  });
  test('sales bills with tier prices but never sees cost', () => {
    expect(can('sales', 'price_tier:read')).toBe(true);
    expect(can('sales', 'customer:write')).toBe(true);
    expect(can('sales', 'cost:read')).toBe(false);
  });
  test('every role resolves to a defined permission list', () => {
    for (const role of ROLES) expect(permissionsOf(role).length).toBeGreaterThan(0);
  });
});

describe('stripCost', () => {
  test('removes cost keys at every depth, including inside arrays', () => {
    const payload = {
      sku: 'HOE-001',
      unitCost: 12000,
      consumptions: [{ lotId: 'a', lineCost: 1 }],
      lines: [{ id: 'l1', totalCost: 5, qty: 2 }],
    };
    // The static type of stripCost claims T, but the runtime result is the
    // stripped object, so type it as a record to state the stripped shape.
    const stripped: Record<string, unknown> = stripCost(payload);
    expect(stripped).toEqual({ sku: 'HOE-001', lines: [{ id: 'l1', qty: 2 }] });
  });
  test('every documented cost key is in the set', () => {
    for (const key of ['unitCost', 'stockValue', 'cogs', 'margin', 'consumptions', 'grossProfit']) {
      expect(COST_KEYS.has(key)).toBe(true);
    }
  });
});

describe('redactForRole', () => {
  const payload = { unitCost: 1, priceTierId: 'x', sku: 'a' };

  test('sales keeps tier keys and sku, loses only cost', () => {
    const out = redactForRole('sales', payload);
    expect(out.sku).toBe('a');
    expect(out.priceTierId).toBe('x');
    expect('unitCost' in out).toBe(false);
  });
  test('stock_staff keeps only sku', () => {
    // The static type keeps T even though runtime keys are dropped, so state
    // the stripped shape as a record (same trick as the stripCost test above).
    const out: Record<string, unknown> = redactForRole('stock_staff', payload);
    expect(out).toEqual({ sku: 'a' });
  });
  test('owner gets the payload unchanged', () => {
    expect(redactForRole('owner', payload)).toEqual(payload);
  });
  test('a nested Date survives redaction as a Date', () => {
    const at = new Date('2025-01-01T00:00:00Z');
    const out = redactForRole('sales', { at, unitCost: 1 });
    expect(out.at).toBe(at);
    expect(out.at instanceof Date).toBe(true);
  });
  test('every key of every policy is a camelCase identifier', () => {
    for (const policy of FIELD_POLICIES) {
      for (const key of policy.keys) expect(key).toMatch(/^[a-z][A-Za-z0-9]*$/);
    }
  });
});
