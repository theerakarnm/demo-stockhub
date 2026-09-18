/**
 * Customers of the wholesale counter.
 *
 * Every read joins priceTiers so callers get the tier code and display name in
 * one round trip - the customers screen and the bill receipt both render them.
 * Writes are plain inserts/updates; the tier reference is validated by the
 * service layer, which can explain "unknown tier" better than a FK violation.
 */

import { type CustomerId, type OrgId, StockHubError } from '@stockhub/core';
import { and, asc, desc, eq, getTableColumns, ilike, or } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type Customer, type NewCustomer, customers, priceTiers } from '../schema';

export type CustomerWithTier = Customer & {
  priceTierCode: string | null;
  priceTierName: string | null;
};

const customerWithTier = {
  ...getTableColumns(customers),
  priceTierCode: priceTiers.code,
  priceTierName: priceTiers.name,
};

/** Active customers first, then alphabetical - the order the screen shows. */
export const listCustomers = async (
  exec: DbExecutor,
  query: { orgId: OrgId; q?: string; limit: number },
): Promise<CustomerWithTier[]> => {
  const search = query.q
    ? or(
        ilike(customers.name, `%${query.q.trim()}%`),
        ilike(customers.phone, `%${query.q.trim()}%`),
      )
    : undefined;
  return exec
    .select(customerWithTier)
    .from(customers)
    .leftJoin(priceTiers, eq(priceTiers.id, customers.priceTierId))
    .where(and(eq(customers.orgId, query.orgId), search))
    .orderBy(desc(customers.isActive), asc(customers.name))
    .limit(query.limit);
};

export const getCustomer = async (
  exec: DbExecutor,
  params: { orgId: OrgId; customerId: CustomerId },
): Promise<CustomerWithTier | undefined> => {
  const [row] = await exec
    .select(customerWithTier)
    .from(customers)
    .leftJoin(priceTiers, eq(priceTiers.id, customers.priceTierId))
    .where(and(eq(customers.orgId, params.orgId), eq(customers.id, params.customerId)))
    .limit(1);
  return row;
};

export const createCustomer = async (exec: DbExecutor, values: NewCustomer): Promise<Customer> => {
  const [row] = await exec.insert(customers).values(values).returning();
  if (!row) throw new Error('Insert into customers returned no row');
  return row;
};

export interface CustomerPatch {
  orgId: OrgId;
  customerId: CustomerId;
  patch: Partial<
    Pick<NewCustomer, 'name' | 'phone' | 'email' | 'priceTierId' | 'note' | 'isActive'>
  >;
}

export const updateCustomer = async (
  exec: DbExecutor,
  params: CustomerPatch,
): Promise<Customer> => {
  const [row] = await exec
    .update(customers)
    .set(params.patch)
    .where(and(eq(customers.orgId, params.orgId), eq(customers.id, params.customerId)))
    .returning();
  if (!row) {
    throw new StockHubError('not_found', `Customer ${params.customerId} not found`, {
      customerId: params.customerId,
    });
  }
  return row;
};
