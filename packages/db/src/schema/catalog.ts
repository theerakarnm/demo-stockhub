/**
 * Product catalogue.
 *
 * products  = what the shop sells conceptually ('จอบขุดดิน')
 * variants  = the stock keeping unit that actually holds quantity and cost
 * bundle_components = the recipe of a สินค้าชุด
 *
 * Stock, cost and orders always point at a VARIANT, never at a product. A
 * bundle variant (`kind = 'bundle'`) holds NO stock of its own: its
 * availability is derived from its components at read time. See
 * packages/core/src/services/stock/bundle.ts.
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
import { variantKindEnum } from './enums';
import { orgIdColumn } from './org';

export const products = pgTable(
  'products',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    /** Thai display name shown in every screen. */
    name: text('name').notNull(),
    /** Free text grouping for the demo ('เครื่องมือช่าง', 'ปุ๋ยและยา', ...). */
    category: text('category'),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index('products_org_idx').on(table.orgId),
    // Catalogue search by name is the most common list query.
    index('products_org_name_idx').on(table.orgId, table.name),
  ],
);

export const variants = pgTable(
  'variants',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Internal SKU. This is what import matching compares against. */
    sku: text('sku').notNull(),
    /** Variation label, e.g. 'ขนาด 50 กก.'. Null for a single-variant product. */
    name: text('name'),
    kind: variantKindEnum('kind').notNull().default('simple'),
    barcode: text('barcode'),
    /** Selling unit: 'ชิ้น', 'กระสอบ', 'เมตร', 'ชุด'. */
    unit: text('unit').notNull().default('ชิ้น'),
    /** Default selling price in satang. Channels may override per listing. */
    sellingPrice: money('selling_price').notNull().default(0),
    /** Reorder point used by the low-stock widget. */
    reorderPoint: integer('reorder_point').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // A SKU identifies exactly one variant inside a tenant. Import matching
    // relies on this being unique.
    uniqueIndex('variants_org_sku_uq').on(table.orgId, table.sku),
    index('variants_org_idx').on(table.orgId),
    index('variants_product_idx').on(table.productId),
    index('variants_barcode_idx').on(table.orgId, table.barcode),
    check('variants_money_nonneg', sql`${table.sellingPrice} >= 0 AND ${table.reorderPoint} >= 0`),
  ],
);

/**
 * Recipe rows for a bundle variant.
 *
 * Selling 1 bundle consumes `qtyPerBundle` of each component. Components must
 * be `kind = 'simple'`; nested bundles are rejected in the service layer, not
 * by a constraint, so the error message can explain why.
 */
export const bundleComponents = pgTable(
  'bundle_components',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    bundleVariantId: uuid('bundle_variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'cascade' }),
    componentVariantId: uuid('component_variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'restrict' }),
    /** Units of the component inside ONE bundle. Must be >= 1. */
    qtyPerBundle: integer('qty_per_bundle').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    // A component appears at most once per bundle; change the qty instead.
    uniqueIndex('bundle_components_uq').on(table.bundleVariantId, table.componentVariantId),
    index('bundle_components_component_idx').on(table.componentVariantId),
    index('bundle_components_org_idx').on(table.orgId),
    // A bundle that consumes zero of a component does not need the row.
    check('bundle_components_qty_min_one', sql`${table.qtyPerBundle} >= 1`),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Variant = typeof variants.$inferSelect;
export type NewVariant = typeof variants.$inferInsert;
export type BundleComponent = typeof bundleComponents.$inferSelect;
export type NewBundleComponent = typeof bundleComponents.$inferInsert;
