/**
 * Shop customers.
 *
 * The rules this file must not break:
 *   - every query filters by org_id, even through the join to price_tiers;
 *   - the soft-delete convention here is `is_active = false`, so the list keeps
 *     showing deactivated customers (a bill may need their history) but the
 *     pickers can hide them.
 *
 * `listCustomers` joins the tier so the screen can show 'ราคาส่ง' next to the
 * name without a second round trip.
 */

import { type CustomerId, type OrgId, StockHubError } from '@stockhub/core';
import { and, asc, desc, eq, getTableColumns, ilike, or } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type Customer, customers, priceTiers } from '../schema';

export interface CustomerWithTier extends Customer {
  priceTierCode: string | null;
  priceTierName: string | null;
}

const withTier = {
  ...getTableColumns(customers),
  priceTierCode: priceTiers.code,
  priceTierName: priceTiers.name,
};

export interface ListCustomersInput {
  orgId: OrgId;
  /** Free text matched against the name or the phone. */
  q?: string;
  limit: number;
}

export const listCustomers = async (
  exec: DbExecutor,
  params: ListCustomersInput,
): Promise<CustomerWithTier[]> => {
  const filters = [eq(customers.orgId, params.orgId)];
  const q = params.q?.trim();
  if (q) {
    const needle = `%${q}%`;
    const text = or(ilike(customers.name, needle), ilike(customers.phone, needle));
    if (text) filters.push(text);
  }
  // Active first, then alphabetical: the picker shows the current trade
  // customers before the dormant ones.
  return exec
    .select(withTier)
    .from(customers)
    .leftJoin(priceTiers, eq(priceTiers.id, customers.priceTierId))
    .where(and(...filters))
    .orderBy(desc(customers.isActive), asc(customers.name))
    .limit(params.limit);
};

export const getCustomer = async (
  exec: DbExecutor,
  params: { orgId: OrgId; customerId: CustomerId },
): Promise<CustomerWithTier | undefined> => {
  const [row] = await exec
    .select(withTier)
    .from(customers)
    .leftJoin(priceTiers, eq(priceTiers.id, customers.priceTierId))
    .where(and(eq(customers.orgId, params.orgId), eq(customers.id, params.customerId)))
    .limit(1);
  return row;
};

export interface CreateCustomerInput {
  orgId: OrgId;
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  priceTierId?: string | null;
  note?: string | null;
  isActive?: boolean;
}

export const createCustomer = async (
  exec: DbExecutor,
  input: CreateCustomerInput,
): Promise<Customer> => {
  const [row] = await exec
    .insert(customers)
    .values({
      orgId: input.orgId,
      id: input.id,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      priceTierId: input.priceTierId ?? null,
      note: input.note ?? null,
      isActive: input.isActive ?? true,
    })
    .returning();
  // An INSERT ... RETURNING always yields the row; this guards only the type.
  if (!row) throw new StockHubError('conflict', 'Insert into customers returned no row');
  return row;
};

export interface UpdateCustomerInput {
  orgId: OrgId;
  customerId: CustomerId;
  patch: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'priceTierId' | 'note' | 'isActive'>>;
}

export const updateCustomer = async (
  exec: DbExecutor,
  params: UpdateCustomerInput,
): Promise<Customer> => {
  const [row] = await exec
    .update(customers)
    .set(params.patch)
    .where(and(eq(customers.orgId, params.orgId), eq(customers.id, params.customerId)))
    .returning();
  // The API layer maps 'not_found' to 404; the repo's job is to say WHY it stopped.
  if (!row) {
    throw new StockHubError('not_found', `Customer ${params.customerId} not found`, {
      customerId: params.customerId,
    });
  }
  return row;
};
