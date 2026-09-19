/**
 * Sales channels and the SKU map that makes imports boring.
 *
 * `channels` is one Shopee shop, one Lazada shop, the POS till, the wholesale
 * desk. Several channels can share a kind (the shop runs two Shopee stores).
 *
 * `channel_listings` is the learned mapping platform SKU -> internal variant.
 * Every time a human resolves an unmatched line on the import preview screen we
 * write a row here with `matchSource = 'manual'`, so the next file matches by
 * itself. This table is what turns a painful monthly import into a click.
 */

import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { variants } from './catalog';
import { channelKindEnum, matchSourceEnum } from './enums';
import { orgIdColumn } from './org';

export const channels = pgTable(
  'channels',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    kind: channelKindEnum('kind').notNull(),
    /** What the staff call it, e.g. 'Shopee - ร้านหลัก'. */
    name: text('name').notNull(),
    /** Shop id on the platform. Useful later for an API adapter. */
    externalShopId: text('external_shop_id'),
    isActive: boolean('is_active').notNull().default(true),
    /** Default marketplace commission in basis points (1400 = 14.00%). 0 for own channels. */
    feeRateBps: integer('fee_rate_bps').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('channels_org_idx').on(table.orgId),
    index('channels_org_kind_idx').on(table.orgId, table.kind),
    check('channels_fee_rate_bps_range', sql`${table.feeRateBps} >= 0 AND ${table.feeRateBps} <= 10000`),
  ],
);

export const channelListings = pgTable(
  'channel_listings',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    /** SKU exactly as the platform export prints it. Stored verbatim. */
    platformSku: text('platform_sku').notNull(),
    /** Product name as printed on the platform, for the preview screen. */
    platformProductName: text('platform_product_name'),
    /** Null means 'known listing we deliberately ignore' (e.g. a freebie). */
    variantId: uuid('variant_id').references(() => variants.id, { onDelete: 'set null' }),
    /** How this mapping was created. 'manual' rows are human decisions. */
    matchSource: matchSourceEnum('match_source').notNull().default('manual'),
    ...timestamps,
  },
  (table) => [
    // The lookup key of the whole import pipeline. Unique so a re-import can
    // upsert instead of duplicating.
    uniqueIndex('channel_listings_channel_sku_uq').on(table.channelId, table.platformSku),
    index('channel_listings_variant_idx').on(table.variantId),
    index('channel_listings_org_idx').on(table.orgId),
  ],
);

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type ChannelListing = typeof channelListings.$inferSelect;
export type NewChannelListing = typeof channelListings.$inferInsert;
