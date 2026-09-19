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
  'customer:read', // list and search customers
  'customer:write', // create / edit a customer and set their price tier
  'price_tier:read', // see tier prices on a product or a bill
  'price_tier:write', // edit the price matrix
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
    'customer:read',
    'customer:write',
    'price_tier:read',
    'price_tier:write',
  ],
  // Warehouse staff move goods but must not see what the goods cost, nor tier pricing.
  stock_staff: ['stock:read', 'stock:adjust', 'import:run', 'order:read'],
  // Shop floor sells at the tier price and must not see margin.
  sales: [
    'stock:read',
    'order:create',
    'order:read',
    'customer:read',
    'customer:write',
    'price_tier:read',
  ],
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
export const COST_KEYS: ReadonlySet<string> = new Set([
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
  // FIFO slices of a movement, each carrying the lot cost of the slice
  'consumptions',
  // Ledger money on a movement line and the movement total
  'lineCost',
  'costTotal',
  // Report totals already named in apps/web/src/lib/api-types.ts
  'grossProfit',
  'totalCogs',
  // The platform fee an order pays, its provenance, and any nested fee object
  'fee',
  'platformFee',
  'feeSource',
]);

/**
 * Tier pricing keys follow the same lifecycle as cost keys: a response that
 * names them disappears for roles without `price_tier:read` (sales sees them,
 * stock_staff does not).
 */
export const PRICE_TIER_KEYS: ReadonlySet<string> = new Set([
  'priceTierId',
  'priceTierCode',
  'priceTierName',
  'tierPrices',
  'priceSource',
]);

/** One redaction policy: a permission gates a set of payload keys. */
export interface FieldPolicy {
  permission: Permission;
  keys: ReadonlySet<string>;
}

/**
 * Every key set and the permission that guards it, in one table.
 *
 * A reviewer reads the whole redaction policy from this list; a new field
 * category means adding one entry here plus its key set, not a new middleware.
 */
export const FIELD_POLICIES: readonly FieldPolicy[] = [
  { permission: 'cost:read', keys: COST_KEYS },
  { permission: 'price_tier:read', keys: PRICE_TIER_KEYS },
];

/** Union of the keys of every policy whose permission the role lacks. */
export const blockedKeysFor = (role: Role): ReadonlySet<string> => {
  const blocked = new Set<string>();
  for (const policy of FIELD_POLICIES) {
    if (can(role, policy.permission)) continue;
    for (const key of policy.keys) blocked.add(key);
  }
  return blocked;
};

/**
 * Strip every blocked key from an arbitrary payload shape, at any depth.
 *
 * Primitives, `null` and `Date` instances pass through untouched; a `Date` is
 * an object whose entries list is empty, so it must be short-circuited before
 * the plain-object branch or it comes back as `{}`.
 */
export const stripKeys = <T>(payload: T, keys: ReadonlySet<string>): T => {
  if (payload instanceof Date) return payload;
  if (Array.isArray(payload)) return payload.map((item) => stripKeys(item, keys)) as T;
  if (payload === null || typeof payload !== 'object') return payload;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (keys.has(key)) continue;
    out[key] = stripKeys(value, keys);
  }
  return out as T;
};

/** Redact a payload for one role using the FIELD_POLICIES table. */
export const redactForRole = <T>(role: Role, payload: T): T =>
  stripKeys(payload, blockedKeysFor(role));

export const stripCost = <T>(payload: T): T => stripKeys(payload, COST_KEYS);
