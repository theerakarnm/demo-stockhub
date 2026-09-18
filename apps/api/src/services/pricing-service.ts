/**
 * Customers and pricing: the read models behind the customers screen, the
 * price matrix and the bill screen.
 *
 * Pure orchestration - SQL lives in @stockhub/db repositories, the tier
 * fallback rule in @stockhub/core's resolvePrice. Tier fields are returned
 * like any other field; stripping them for roles without price_tier:read is
 * the response layer's job (Track E wires PRICE_TIER_KEYS into it).
 */

import { StockHubError, asCustomerId } from '@stockhub/core';
import { customerRepo, pricingRepo } from '@stockhub/db';
import type { CustomerInput, ListCustomersQuery } from '../schemas/pricing';
import type { CustomerView } from '../types/contract';
import type { ServiceContext } from './context';

/** Repo row joined with its tier, exactly what toCustomerView consumes. */
type CustomerRow = NonNullable<Awaited<ReturnType<typeof customerRepo.getCustomer>>>;

/** Map the repo row onto the wire. Null columns become absent keys. */
export const toCustomerView = (row: CustomerRow): CustomerView => ({
  id: row.id,
  name: row.name,
  ...(row.phone !== null && { phone: row.phone }),
  ...(row.email !== null && { email: row.email }),
  ...(row.note !== null && { note: row.note }),
  isActive: row.isActive,
  ...(row.priceTierId !== null && { priceTierId: row.priceTierId }),
  ...(row.priceTierCode !== null && { priceTierCode: row.priceTierCode }),
  ...(row.priceTierName !== null && { priceTierName: row.priceTierName }),
  createdAt: row.createdAt.toISOString(),
});

/** A tier id must reference a tier of the caller's org, or input is wrong. */
const assertTierInOrg = async (
  ctx: ServiceContext,
  tierId: string | null | undefined,
): Promise<void> => {
  if (!tierId) return;
  const tiers = await pricingRepo.listTiers(ctx.db(), { orgId: ctx.auth.orgId });
  if (!tiers.some((tier) => tier.id === tierId)) {
    throw new StockHubError('validation_error', `Price tier ${tierId} does not belong to this org`, {
      priceTierId: tierId,
    });
  }
};

export const listCustomers = async (
  ctx: ServiceContext,
  query: ListCustomersQuery,
): Promise<CustomerView[]> => {
  const rows = await customerRepo.listCustomers(ctx.db(), {
    orgId: ctx.auth.orgId,
    q: query.q,
    limit: query.limit,
  });
  return rows.map(toCustomerView);
};

export const getCustomer = async (ctx: ServiceContext, customerId: string): Promise<CustomerView> => {
  const row = await customerRepo.getCustomer(ctx.db(), {
    orgId: ctx.auth.orgId,
    customerId: asCustomerId(customerId),
  });
  if (!row) {
    throw new StockHubError('not_found', `Customer ${customerId} not found`, { customerId });
  }
  return toCustomerView(row);
};

export const createCustomer = async (
  ctx: ServiceContext,
  input: CustomerInput,
): Promise<CustomerView> => {
  await assertTierInOrg(ctx, input.priceTierId);
  const created = await customerRepo.createCustomer(ctx.db(), {
    orgId: ctx.auth.orgId,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    note: input.note ?? null,
    priceTierId: input.priceTierId ?? null,
    isActive: input.isActive ?? true,
  });
  // Re-read through the joined query so the view carries the tier code/name.
  const row = await customerRepo.getCustomer(ctx.db(), {
    orgId: ctx.auth.orgId,
    customerId: asCustomerId(created.id),
  });
  if (!row) {
    throw new StockHubError('not_found', `Customer ${created.id} disappeared after insert`, {
      customerId: created.id,
    });
  }
  return toCustomerView(row);
};

export const updateCustomer = async (
  ctx: ServiceContext,
  customerId: string,
  input: CustomerInput,
): Promise<CustomerView> => {
  await assertTierInOrg(ctx, input.priceTierId);
  // Only the keys the caller sent change; an explicit null clears the column.
  const patch = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.email !== undefined && { email: input.email }),
    ...(input.note !== undefined && { note: input.note }),
    ...(input.priceTierId !== undefined && { priceTierId: input.priceTierId }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  };
  await customerRepo.updateCustomer(ctx.db(), {
    orgId: ctx.auth.orgId,
    customerId: asCustomerId(customerId),
    patch,
  });
  return getCustomer(ctx, customerId);
};
