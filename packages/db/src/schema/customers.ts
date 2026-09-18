/**
 * Customers of the wholesale counter.
 *
 * A customer may carry a price tier, which decides how bill lines are priced.
 * Walk-in customers have no row at all - the bill screen just leaves the
 * customer unset and pricing falls back to the default tier.
 */

import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { orgIdColumn } from './org';
import { priceTiers } from './pricing';

export const customers = pgTable(
  'customers',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    /** Thai display name; the phone is how staff find them but is optional. */
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    /** Priced by this tier when set; null means the default tier applies. */
    priceTierId: uuid('price_tier_id').references(() => priceTiers.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // The customer list is searched by name most of the time.
    index('customers_org_name_idx').on(table.orgId, table.name),
    index('customers_org_idx').on(table.orgId),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
