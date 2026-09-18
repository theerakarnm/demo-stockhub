/**
 * Role based access control.
 *
 * The demo's headline feature is that cost data disappears when you switch job
 * position. Enforce that HERE and on the API, never only in the UI - hiding a
 * column in React still ships the number in the JSON payload.
 *
 * Usage:
 *   if (!can(role, 'cost:read')) return stripCost(rows);
 *   // or apply the whole policy table (cost + tier + future fields) at once:
 *   return redactForRole(role, rows);
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
]);

/**
 * Wire keys that carry tier pricing data. Filtered exactly like COST_KEYS but
 * gated by `price_tier:read` instead: sales quotes a tier price while
 * stock_staff must not even see that the tier system exists.
 */
export const PRICE_TIER_KEYS: ReadonlySet<string> = new Set([
  'priceTierId',
  'priceTierCode',
  'priceTierName',
  'tierPrices',
  'priceSource',
]);

/** One visibility rule: a caller without `permission` never receives `keys`. */
export interface FieldPolicy {
  permission: Permission;
  keys: ReadonlySet<string>;
}

/**
 * The whole field visibility policy in one table. Response helpers and the
 * response middleware both derive their behaviour from here, so registering a
 * sensitive key once hides it everywhere, for every current and future route.
 */
export const FIELD_POLICIES: readonly FieldPolicy[] = [
  { permission: 'cost:read', keys: COST_KEYS },
  { permission: 'price_tier:read', keys: PRICE_TIER_KEYS },
];

const BLOCKED_KEYS_CACHE = new Map<Role, ReadonlySet<string>>();

/** Union of the keys of every policy whose permission the role lacks. */
export const blockedKeysFor = (role: Role): ReadonlySet<string> => {
  const cached = BLOCKED_KEYS_CACHE.get(role);
  if (cached) return cached;
  const blocked = new Set<string>();
  for (const policy of FIELD_POLICIES) {
    if (can(role, policy.permission)) continue;
    for (const key of policy.keys) blocked.add(key);
  }
  BLOCKED_KEYS_CACHE.set(role, blocked);
  return blocked;
};

/**
 * Deep copy of `payload` with every key in `keys` removed at any depth.
 *
 * Primitives, null and Date instances pass through untouched. A Date carries
 * no enumerable keys, so an unguarded Object.entries walk would silently turn
 * every timestamp into `{}`.
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

/**
 * Remove every cost-bearing field from an API payload.
 *
 * Kept as a named helper because existing call sites speak about cost only.
 * New code should prefer redactForRole(), which applies the whole policy
 * table and can never disagree with the middleware about visibility.
 */
export const stripCost = <T>(payload: T): T => stripKeys(payload, COST_KEYS);

/** Redact a payload for one role: every blocked key disappears, at any depth. */
export const redactForRole = <T>(role: Role, payload: T): T =>
  stripKeys(payload, blockedKeysFor(role));
