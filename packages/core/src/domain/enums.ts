/**
 * Single source of truth for every enum in the system.
 *
 * packages/db mirrors these into pgEnum columns. When you add a value here you
 * must also add it in packages/db/src/schema/enums.ts and generate a migration.
 */

/** Sales/stock channel kind. One org can own many channels of the same kind. */
export const CHANNEL_KINDS = ['shopee', 'lazada', 'tiktok', 'pos', 'wholesale', 'manual'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** Which platforms have an import adapter today. Extend with an API adapter later. */
export const IMPORTABLE_CHANNEL_KINDS = ['shopee', 'lazada', 'tiktok'] as const;
export type ImportableChannelKind = (typeof IMPORTABLE_CHANNEL_KINDS)[number];

/** Job position. Drives cost visibility - see rbac.ts. */
export const ROLES = ['owner', 'manager', 'stock_staff', 'sales'] as const;
export type Role = (typeof ROLES)[number];

/** Why stock moved. Every movement row carries exactly one reason. */
export const MOVEMENT_REASONS = [
  'purchase_in', // goods received from a supplier -> creates a FIFO lot
  'sale_out', // order shipped/confirmed -> consumes FIFO lots
  'return_in', // customer return -> restores qty, restores the consumed cost
  'cancel_restore', // order cancelled before shipping -> reverses sale_out
  'adjust_in', // stock count found more
  'adjust_out', // stock count found less / damage / loss
  'transfer_in',
  'transfer_out',
  'bundle_assemble', // components out, bundle in
  'bundle_disassemble', // bundle out, components in
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Movements that add quantity. Everything else removes it. */
export const INBOUND_REASONS: readonly MovementReason[] = [
  'purchase_in',
  'return_in',
  'cancel_restore',
  'adjust_in',
  'transfer_in',
  'bundle_assemble',
  'bundle_disassemble',
];

export const isInbound = (reason: MovementReason): boolean => INBOUND_REASONS.includes(reason);

/** Normalised order status across every platform. Adapters map into this. */
export const ORDER_STATUSES = [
  'pending', // paid but not shipped - does not move stock yet
  'confirmed', // ready to ship - reserves stock
  'shipped', // stock left the warehouse - triggers sale_out
  'delivered',
  'cancelled', // triggers cancel_restore if it had already moved stock
  'returned', // triggers return_in
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Lifecycle of one uploaded export file. */
export const IMPORT_STATUSES = [
  'uploaded', // file is in R2, nothing parsed yet
  'parsing',
  'preview_ready', // parsed + matched, waiting for the user to confirm
  'applying',
  'applied', // stock movements committed
  'failed',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** How an imported line was matched to an internal variant. */
export const MATCH_SOURCES = [
  'listing_map',
  'sku_exact',
  'sku_normalised',
  'manual',
  'unmatched',
] as const;
export type MatchSource = (typeof MATCH_SOURCES)[number];

/** simple = one SKU, bundle = made of other variants (สินค้าชุด). */
export const VARIANT_KINDS = ['simple', 'bundle'] as const;
export type VariantKind = (typeof VARIANT_KINDS)[number];
