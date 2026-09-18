/**
 * Wholesale price tiers.
 *
 * price_tiers = a named price level ('ราคาปลีก', 'ราคาส่ง', 'ราคาตัวแทน')
 * price_tier_prices = one tier price for one variant, in satang
 *
 * A tier never stores a percentage: the shop types the actual price per
 * variant, so every bill shows a number the cashier can defend. Missing rows
 * are normal - price resolution falls back to the default tier and then to the
 * variant selling price. See packages/core/src/services/pricing/resolve-price.ts.
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
    /** Short machine name used in codes and URLs ('retail', 'wholesale'). */
    code: text('code').notNull(),
    /** Thai display name shown on screens ('ราคาส่ง'). */
    name: text('name').notNull(),
    /** Ordering in pickers; lower comes first. */
    sortOrder: integer('sort_order').notNull().default(0),
    /** The default tier prices customers who have no tier of their own. */
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    // A code identifies exactly one tier inside a tenant.
    uniqueIndex('price_tiers_org_code_uq').on(table.orgId, table.code),
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
    /** Tier price per unit in satang. Missing rows fall back in the resolver. */
    price: money('price').notNull(),
    ...timestamps,
  },
  (table) => [
    // One price per (tier, variant); editing replaces the row through upsert.
    uniqueIndex('price_tier_prices_tier_variant_uq').on(table.priceTierId, table.variantId),
    index('price_tier_prices_org_idx').on(table.orgId),
    check('price_tier_prices_price_nonneg', sql`${table.price} >= 0`),
  ],
);

export type PriceTier = typeof priceTiers.$inferSelect;
export type NewPriceTier = typeof priceTiers.$inferInsert;
export type PriceTierPrice = typeof priceTierPrices.$inferSelect;
export type NewPriceTierPrice = typeof priceTierPrices.$inferInsert;
