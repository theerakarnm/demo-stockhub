/**
 * Role based access control.
 *
 * The demo's headline feature is that cost data disappears when you switch job
 * position. Enforce that HERE and on the API, never only in the UI - hiding a
 * column in React still ships the number in the JSON payload.
 *
 * Usage:
 *   if (!can(role, 'cost:read')) return stripCost(rows);
 */

import type { Role } from './domain/enums';

export const PERMISSIONS = [
  'stock:read',
  'stock:adjust',
  'cost:read', // see unit cost, COGS, margin, supplier price
  'cost:write', // set purchase cost, edit FIFO lots
  'import:run',
  'order:create', // open a POS / wholesale bill
  'order:read',
  'product:write',
  'channel:write',
  'report:read',
  'user:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: [
    'stock:read',
    'stock:adjust',
    'cost:read',
    'cost:write',
    'import:run',
    'order:create',
    'order:read',
    'product:write',
    'channel:write',
    'report:read',
  ],
  // Warehouse staff move goods but must not see what the goods cost.
  stock_staff: ['stock:read', 'stock:adjust', 'import:run', 'order:read'],
  // Shop floor sells at the selling price and must not see margin.
  sales: ['stock:read', 'order:create', 'order:read'],
};

export const can = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);

export const permissionsOf = (role: Role): readonly Permission[] => ROLE_PERMISSIONS[role];

/** Human label for the role switcher in the demo header. */
export const ROLE_LABELS: Record<Role, { en: string; th: string }> = {
  owner: { en: 'Owner', th: 'เจ้าของกิจการ' },
  manager: { en: 'Manager', th: 'ผู้จัดการ' },
  stock_staff: { en: 'Stock staff', th: 'พนักงานคลัง' },
  sales: { en: 'Sales', th: 'พนักงานขาย' },
};

/**
 * Remove every cost-bearing field from an API payload.
 *
 * Add a key here the moment you add a cost field to a response type, and keep
 * the API route calling this - that is the single choke point for the feature.
 */
const COST_KEYS = new Set([
  'unitCost',
  'avgUnitCost',
  'totalCost',
  'cogs',
  'margin',
  'marginPct',
  'profit',
  'purchasePrice',
  'supplierPrice',
  'lots',
  // Stock value is quantity * purchase cost, so it leaks cost just as directly
  // as unitCost does. It reached the contract before it reached this set, which
  // is exactly the failure mode this comment exists to prevent: add the key here
  // in the SAME commit that adds the field to a response type.
  'stockValue',
  'stockValueTotal',
  'grossMargin',
]);

export const stripCost = <T>(payload: T): T => {
  if (Array.isArray(payload)) return payload.map((item) => stripCost(item)) as T;
  if (payload === null || typeof payload !== 'object') return payload;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (COST_KEYS.has(key)) continue;
    out[key] = stripCost(value);
  }
  return out as T;
};
