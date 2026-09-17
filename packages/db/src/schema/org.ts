/**
 * Tenancy and people.
 *
 * One `organization` = one customer (here: the agricultural tool shop).
 * Every other business table hangs off an org id.
 *
 * Why there is no `memberships` table yet: in this product a user works for one
 * shop, so `users.org_id` + `users.role` answers every question we have. The
 * day a franchise owner needs two shops, add `memberships(user_id, org_id,
 * role)`, move the role there, and keep `users` as pure identity. Nothing else
 * in the schema changes, because the API already resolves every request into a
 * (userId, orgId, role) context before it touches a repository.
 */

import { boolean, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { roleEnum } from './enums';

export const organizations = pgTable(
  'organizations',
  {
    id: primaryId(),
    /** Display name, e.g. 'ร้านเกษตรรุ่งเรือง'. */
    name: text('name').notNull(),
    /** URL safe key. The demo picks a tenant with this instead of real auth. */
    slug: text('slug').notNull(),
    /** IANA zone. Marketplace exports print local time with no offset. */
    timeZone: text('time_zone').notNull().default('Asia/Bangkok'),
    ...timestamps,
  },
  (table) => [uniqueIndex('organizations_slug_uq').on(table.slug)],
);

/**
 * The org foreign key used by every business table.
 *
 * Import this instead of re-typing the column so the cascade rule and the
 * column name stay identical everywhere.
 */
export const orgIdColumn = () =>
  uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    /**
     * Job position. This is the value the whole cost-visibility feature keys
     * off. Enforce it with can()/stripCost() from @stockhub/core on the API
     * side, never in the UI alone.
     */
    role: roleEnum('role').notNull().default('sales'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // Email is unique inside a tenant, not globally: the same person could work
    // for two shops once memberships exist.
    uniqueIndex('users_org_email_uq').on(table.orgId, table.email),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
