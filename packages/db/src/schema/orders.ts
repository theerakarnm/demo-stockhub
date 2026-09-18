/**
 * Orders from every channel, in one normalised shape.
 *
 * A row lands here from three places: a marketplace file import, a POS bill, or
 * a wholesale bill typed by hand. After that they are identical, which is what
 * makes 'one stock pool for 7 sales points' possible.
 *
 * Idempotent re-import is the reason for the unique (channel_id,
 * external_order_id) index: the shop owner will re-upload the same file, or an
 * overlapping date range, and that must never double-deduct stock. The import
 * applier upserts on this key and only moves stock when the status transition
 * actually requires it.
 */

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps, tsColumn } from './_shared';
import { variants } from './catalog';
import { channels } from './channels';
import { customers } from './customers';
import { matchSourceEnum, orderStatusEnum } from './enums';
import { importBatches } from './imports';
import { orgIdColumn } from './org';
import { priceTiers } from './pricing';

export const orders = pgTable(
  'orders',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    /** Platform order number, or the POS bill number for offline sales. */
    externalOrderId: text('external_order_id').notNull(),
    status: orderStatusEnum('status').notNull().default('pending'),
    orderedAt: tsColumn('ordered_at').notNull(),
    /** Set when the platform marks the parcel handed over. Drives sale_out. */
    shippedAt: tsColumn('shipped_at'),
    cancelledAt: tsColumn('cancelled_at'),
    buyerName: text('buyer_name'),
    /** Sum of line totals after discount, in satang. */
    grandTotal: money('grand_total').notNull().default(0),
    /** Which upload produced this order. Null for POS and wholesale. */
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    /** Shop customer behind a POS/wholesale bill. Null for marketplace imports. */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    /** Tier snapshot at bill time, kept even if the customer's tier changes later. */
    priceTierId: uuid('price_tier_id').references(() => priceTiers.id, {
      onDelete: 'set null',
    }),
    /** The original export row(s), verbatim. Support answers questions with it. */
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    // Idempotency key for re-import. Do not drop this.
    uniqueIndex('orders_channel_external_uq').on(table.channelId, table.externalOrderId),
    index('orders_org_idx').on(table.orgId),
    // Channel sales report and the order list, both newest first.
    index('orders_channel_ordered_idx').on(table.channelId, table.orderedAt),
    index('orders_org_ordered_idx').on(table.orgId, table.orderedAt),
    index('orders_org_status_idx').on(table.orgId, table.status),
    index('orders_import_batch_idx').on(table.importBatchId),
    check('orders_grand_total_nonneg', sql`${table.grandTotal} >= 0`),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /**
     * Null until the line is matched to an internal variant. A null here is not
     * an error, it is the work queue of the import preview screen.
     */
    variantId: uuid('variant_id').references(() => variants.id, { onDelete: 'set null' }),
    /** Kept even after matching: it is the evidence for how we matched. */
    platformSku: text('platform_sku').notNull(),
    platformProductName: text('platform_product_name'),
    /** Shopee 'ชื่อตัวเลือก' / Lazada variation text, when the export has one. */
    variationName: text('variation_name'),
    qty: integer('qty').notNull(),
    /** Price per unit before discount, in satang. */
    unitPrice: money('unit_price').notNull().default(0),
    /** Seller funded discount for this line, in satang. Platform subsidy is not. */
    discount: money('discount').notNull().default(0),
    matchSource: matchSourceEnum('match_source').notNull().default('unmatched'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    index('order_lines_order_idx').on(table.orderId),
    index('order_lines_variant_idx').on(table.variantId),
    index('order_lines_org_idx').on(table.orgId),
    // 'show me every unmatched line in this tenant' - the preview work queue.
    index('order_lines_org_match_idx').on(table.orgId, table.matchSource),
    check('order_lines_qty_positive', sql`${table.qty} > 0`),
    check('order_lines_money_nonneg', sql`${table.unitPrice} >= 0 AND ${table.discount} >= 0`),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderLine = typeof orderLines.$inferSelect;
export type NewOrderLine = typeof orderLines.$inferInsert;
