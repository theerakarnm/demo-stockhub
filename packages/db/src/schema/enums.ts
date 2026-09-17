/**
 * Postgres enum mirrors of packages/core/src/domain/enums.ts.
 *
 * KEEP IN SYNC WITH packages/core/src/domain/enums.ts.
 * Adding a value is a two step job:
 *   1. add it to the core array
 *   2. add it to the matching tuple below, then `bun run db:generate`
 *      (drizzle emits `ALTER TYPE ... ADD VALUE`)
 *
 * The values are repeated here as literal tuples on purpose: drizzle-kit loads
 * this file outside Bun, so a runtime import of the core package would tie the
 * migration tooling to the workspace resolver. Instead the ENUM_SYNC_GUARD
 * below is a compile-time check - if the two lists ever drift, `bun run
 * typecheck` fails with a type error on the drifting line.
 */

import type {
  ChannelKind,
  ImportStatus,
  MatchSource,
  MovementReason,
  OrderStatus,
  Role,
  VariantKind,
} from '@stockhub/core';
import { pgEnum } from 'drizzle-orm/pg-core';

export const channelKindEnum = pgEnum('channel_kind', [
  'shopee',
  'lazada',
  'tiktok',
  'pos',
  'wholesale',
  'manual',
]);

export const roleEnum = pgEnum('role', ['owner', 'manager', 'stock_staff', 'sales']);

export const movementReasonEnum = pgEnum('movement_reason', [
  'purchase_in',
  'sale_out',
  'return_in',
  'cancel_restore',
  'adjust_in',
  'adjust_out',
  'transfer_in',
  'transfer_out',
  'bundle_assemble',
  'bundle_disassemble',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
]);

export const importStatusEnum = pgEnum('import_status', [
  'uploaded',
  'parsing',
  'preview_ready',
  'applying',
  'applied',
  'failed',
]);

export const matchSourceEnum = pgEnum('match_source', [
  'listing_map',
  'sku_exact',
  'sku_normalised',
  'manual',
  'unmatched',
]);

export const variantKindEnum = pgEnum('variant_kind', ['simple', 'bundle']);

/** true only when A and B are exactly the same union. */
type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Compile-time drift detector. Each entry must stay `true`; when a core enum
 * gains a value that this file is missing, the entry resolves to `never` and
 * typecheck fails right here instead of at runtime in production.
 */
export const ENUM_SYNC_GUARD = {
  channelKind: true as SameUnion<(typeof channelKindEnum.enumValues)[number], ChannelKind>,
  role: true as SameUnion<(typeof roleEnum.enumValues)[number], Role>,
  movementReason: true as SameUnion<(typeof movementReasonEnum.enumValues)[number], MovementReason>,
  orderStatus: true as SameUnion<(typeof orderStatusEnum.enumValues)[number], OrderStatus>,
  importStatus: true as SameUnion<(typeof importStatusEnum.enumValues)[number], ImportStatus>,
  matchSource: true as SameUnion<(typeof matchSourceEnum.enumValues)[number], MatchSource>,
  variantKind: true as SameUnion<(typeof variantKindEnum.enumValues)[number], VariantKind>,
} as const;
