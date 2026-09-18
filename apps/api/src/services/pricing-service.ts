/**
 * Customer + pricing orchestration.
 *
 * The rule worth remembering: a customer's priceTierId must reference a tier
 * OF THE SAME ORG. The foreign key cannot check the tenant pair, so
 * createCustomer/updateCustomer verify it against pricingRepo.listTiers()
 * here and answer 400, not 500, when the tier belongs to someone else.
 *
 * Views are plain mappers from repo rows to the wire contract
 * (types/contract-pricing.ts). Tier-bearing fields are listed in
 * PRICE_TIER_KEYS (Track E) and redacted centrally - this file always builds
 * the full shape and never needs to know the caller.
 */

import { type CustomerId, type OrgId, StockHubError, asCustomerId } from '@stockhub/core';
import { type Customer, type PriceTier, customerRepo, pricingRepo } from '@stockhub/db';
import type { CustomerInput, CustomerView } from '../types/contract-pricing';
import type { ServiceContext } from './context';

/** Repo row (already tier-joined) -> wire shape. Nulls collapse off the wire. */
export const toCustomerView = (
  row: Customer & { priceTierCode: string | null; priceTierName: string | null },
): CustomerView => ({
  id: row.id,
  name: row.name,
  ...(row.phone ? { phone: row.phone } : {}),
  ...(row.email ? { email: row.email } : {}),
  ...(row.note ? { note: row.note } : {}),
  isActive: row.isActive,
  ...(row.priceTierId ? { priceTierId: row.priceTierId } : {}),
  ...(row.priceTierCode ? { priceTierCode: row.priceTierCode } : {}),
  ...(row.priceTierName ? { priceTierName: row.priceTierName } : {}),
  createdAt: row.createdAt.toISOString(),
});

export const toTierView = (row: PriceTier) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  sortOrder: row.sortOrder,
  isDefault: row.isDefault,
});

/** The tier must exist INSIDE THIS ORG, otherwise the id came from somewhere else. */
const requireTierOfOrg = async (
  exec: Parameters<typeof pricingRepo.listTiers>[0],
  orgId: OrgId,
  priceTierId: string,
): Promise<void> => {
  const tiers = await pricingRepo.listTiers(exec, { orgId });
  if (!tiers.some((tier) => tier.id === priceTierId)) {
    throw new StockHubError('validation_error', 'Unknown price tier for this org', {
      priceTierId,
    });
  }
};

export const listCustomers = async (
  ctx: ServiceContext,
  query: { q?: string; limit: number },
): Promise<CustomerView[]> => {
  const rows = await customerRepo.listCustomers(ctx.db(), {
    orgId: ctx.auth.orgId,
    q: query.q,
    limit: query.limit,
  });
  return rows.map(toCustomerView);
};

export const getCustomer = async (
  ctx: ServiceContext,
  customerId: CustomerId,
): Promise<CustomerView> => {
  const row = await customerRepo.getCustomer(ctx.db(), { orgId: ctx.auth.orgId, customerId });
  if (!row) throw new StockHubError('not_found', 'ไม่พบลูกค้า', { customerId });
  return toCustomerView(row);
};

export const createCustomer = async (
  ctx: ServiceContext,
  input: CustomerInput,
): Promise<CustomerView> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  if (input.priceTierId) await requireTierOfOrg(exec, orgId, input.priceTierId);
  const row = await customerRepo.createCustomer(exec, {
    orgId,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    priceTierId: input.priceTierId ?? null,
    note: input.note ?? null,
    isActive: input.isActive,
  });
  return getCustomer(ctx, asCustomerId(row.id));
};

/**
 * PATCH semantics: a key that is absent keeps its value; `priceTierId: null`
 * clears the tier and puts the customer back on the standard selling price.
 */
export const updateCustomer = async (
  ctx: ServiceContext,
  customerId: CustomerId,
  input: CustomerInput,
): Promise<CustomerView> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  if (input.priceTierId) await requireTierOfOrg(exec, orgId, input.priceTierId);

  // Distinguish 'stay as is' (undefined) from 'clear it' (null).
  const patch: NonNullable<Parameters<typeof customerRepo.updateCustomer>[1]['patch']> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.note !== undefined) patch.note = input.note;
  if (input.priceTierId !== undefined) patch.priceTierId = input.priceTierId;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const row = await customerRepo.updateCustomer(exec, { orgId, customerId, patch });
  return getCustomer(ctx, asCustomerId(row.id));
};

export const listTiers = async (ctx: ServiceContext) => {
  const tiers = await pricingRepo.listTiers(ctx.db(), { orgId: ctx.auth.orgId });
  return tiers.map(toTierView);
};
