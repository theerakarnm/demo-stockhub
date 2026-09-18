/**
 * Price tiers and their per-variant price rows.
 *
 * A tier ('retail', 'wholesale', 'dealer') groups the wholesale prices a shop
 * quotes to regular trade customers. The prices themselves live in
 * `price_tier_prices`, one row per (tier, variant) cell.
 *
 * The matrix is deliberately sparse: a shop with hundreds of SKUs only fills
 * the cells it cares about, and every missing cell falls back through
 * resolvePrice() in @stockhub/core. That is why the table has no default
 * value trick and no inherited rows.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps } from './_shared';
import { variants } from './catalog';
import { orgIdColumn } from './org';

export const priceTiers = pgTable(
  'price_tiers',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    /** URL/enum-like stable key used by code and seeds, e.g. 'wholesale'. */
    code: text('code').notNull(),
    /** Thai display name, e.g. 'ราคาส่ง'. */
    name: text('name').notNull(),
    /** Display order, cheapest tier first. */
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Exactly one tier per org should be default (enforced in the repo, not by
     * a partial unique index, so the flip to a new default is one update).
     * Cells missing from this tier resolve to the variant selling price.
     */
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    // A code identifies exactly one tier inside a tenant.
    uniqueIndex('price_tiers_org_code_uq').on(table.orgId, table.code),
    index('price_tiers_org_idx').on(table.orgId),
    check('price_tiers_code_format', sql`${table.code} ~ '^[a-z0-9_]{2,32}$'`),
  ],
);

export const priceTierPrices = pgTable(
  'price_tier_prices',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    priceTierId: uuid('price_tier_id')
      .notNull()
      .references(() => priceTiers.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'cascade' }),
    /** Unit price in satang for this variant inside this tier. */
    price: money('price').notNull(),
    ...timestamps,
  },
  (table) => [
    // One cell of the tier matrix. Upserts key on this pair.
    uniqueIndex('price_tier_prices_tier_variant_uq').on(table.priceTierId, table.variantId),
    index('price_tier_prices_org_idx').on(table.orgId),
    index('price_tier_prices_variant_idx').on(table.variantId),
    check('price_tier_prices_price_nonneg', sql`${table.price} >= 0`),
  ],
);

export type PriceTier = typeof priceTiers.$inferSelect;
export type NewPriceTier = typeof priceTiers.$inferInsert;
export type PriceTierPrice = typeof priceTierPrices.$inferSelect;
export type NewPriceTierPrice = typeof priceTierPrices.$inferInsert;
