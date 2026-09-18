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

  test('sales loses cost keys but keeps tier data', () => {
    // The static type claims T, but the runtime result is the redacted object.
    const out: Record<string, unknown> = redactForRole('sales', payload);
    expect(out).toEqual({ priceTierId: 'x', sku: 'a' });
  });

  test('stock_staff loses both cost and tier keys', () => {
    const out: Record<string, unknown> = redactForRole('stock_staff', payload);
    expect(out).toEqual({ sku: 'a' });
  });

  test('owner gets the payload unchanged', () => {
    expect(redactForRole('owner', payload)).toEqual(payload);
  });

  test('a Date survives redaction at any depth', () => {
    const at = new Date('2025-01-01T00:00:00Z');
    const out: { at?: unknown; nested?: { at?: unknown } } = redactForRole('sales', {
      at,
      nested: { at },
    });
    expect(out.at).toBeInstanceOf(Date);
    expect(out.nested?.at).toBeInstanceOf(Date);
  });

  test('every key of every policy is a camelCase identifier', () => {
    // A typo like 'UnitCost' would silently match nothing and leak the field,
    // so the policy table itself is guarded here.
    for (const policy of FIELD_POLICIES) {
      for (const key of policy.keys) expect(key).toMatch(/^[a-z][A-Za-z0-9]*$/);
    }
  });
});
