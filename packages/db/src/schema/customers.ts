/**
 * Customers of the shop, used by the POS bill screen to pick a price tier.
 *
 * A customer is lightweight on purpose: a name, contact channels and the tier
 * that decides the bill prices. Marketplace buyers are NOT customers here -
 * they arrive as `orders.buyer_name` from an import and never get a row in
 * this table, so this table stays small and shop-owned.
 */

import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { priceTiers } from './pricing';
import { orgIdColumn } from './org';

export const customers = pgTable(
  'customers',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    /** Thai display name, e.g. 'ร้านสวนเกษตรดี'. */
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    /** The tier that prices this customer's bills. Null = standard selling price. */
    priceTierId: uuid('price_tier_id').references(() => priceTiers.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // The picker searches by name; phone search is secondary.
    index('customers_org_name_idx').on(table.orgId, table.name),
    index('customers_org_idx').on(table.orgId),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
