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

import {
  type CustomerId,
  type OrgId,
  type PriceTierId,
  type Satang,
  StockHubError,
  type VariantId,
  asCustomerId,
  asPriceTierId,
  asVariantId,
  resolvePrice,
  satang,
} from '@stockhub/core';
import {
  type Customer,
  type DbExecutor,
  type PriceTier,
  catalogRepo,
  customerRepo,
  pricingRepo,
} from '@stockhub/db';
import type {
  CustomerInput,
  CustomerView,
  PriceMatrixRow,
  PriceResolutionView,
} from '../types/contract-pricing';
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

/** Repo matrix row -> wire shape. The sparse `prices` map keeps its name change. */
export const toMatrixView = (row: pricingRepo.PriceMatrixRow): PriceMatrixRow => {
  // Flatten the partial branded record to a plain object; absent cells stay absent.
  const tierPrices: Record<string, number> = {};
  for (const [tierId, price] of Object.entries(row.prices)) {
    if (price !== undefined) tierPrices[tierId] = price;
  }
  return {
    variantId: row.variantId,
    sku: row.sku,
    name: row.name,
    sellingPrice: row.sellingPrice,
    tierPrices,
  };
};

export const getMatrix = async (ctx: ServiceContext): Promise<PriceMatrixRow[]> => {
  const rows = await pricingRepo.listMatrix(ctx.db(), { orgId: ctx.auth.orgId });
  return rows.map(toMatrixView);
};

export interface PutTierPricesResult {
  upserted: number;
  deleted: number;
}

export const putTierPrices = async (
  ctx: ServiceContext,
  priceTierId: string,
  cells: readonly { variantId: string; price: number | null }[],
): Promise<PutTierPricesResult> => {
  const exec = ctx.db();
  // Same tenant rule as the customer's tier: only a tier OF THIS ORG is writable.
  await requireTierOfOrg(exec, ctx.auth.orgId, priceTierId);
  return pricingRepo.upsertTierPrices(exec, {
    orgId: ctx.auth.orgId,
    priceTierId: asPriceTierId(priceTierId),
    prices: cells.map((cell) => ({
      variantId: asVariantId(cell.variantId),
      price: cell.price as Satang | null,
    })),
  });
};

export interface ResolvePricesInput {
  variantIds: readonly string[];
  customerId?: string;
  priceTierId?: string;
}

/**
 * What price every requested variant should use for this customer or tier.
 *
 * `exec` defaults to the request's db handle; the bill flow (P1) passes its
 * own transaction so a bill and its prices are read in one consistent state.
 */
export const resolvePrices = async (
  ctx: ServiceContext,
  input: ResolvePricesInput,
  exec?: DbExecutor,
): Promise<PriceResolutionView[]> => {
  const db = exec ?? ctx.db();
  const orgId = ctx.auth.orgId;

  // The explicit tier wins; otherwise the customer's own tier. A customer from
  // another org (or an unknown id) is 404, not a silent fallback.
  let tierId: PriceTierId | undefined;
  if (input.priceTierId) {
    tierId = asPriceTierId(input.priceTierId);
  } else if (input.customerId) {
    const customer = await customerRepo.getCustomer(db, {
      orgId,
      customerId: asCustomerId(input.customerId),
    });
    if (!customer) {
      throw new StockHubError('not_found', 'ไม่พบลูกค้า', { customerId: input.customerId });
    }
    tierId = customer.priceTierId ? asPriceTierId(customer.priceTierId) : undefined;
  }

  const defaultTier = await pricingRepo.getDefaultTier(db, { orgId });
  const defaultTierId = defaultTier ? asPriceTierId(defaultTier.id) : undefined;

  // One query for BOTH tiers' cells; resolvePrice() does the fallback in memory.
  const tierIds = [...new Set([tierId, defaultTierId].filter((id) => id !== undefined))];
  const [tierPrices, variantById] = await Promise.all([
    pricingRepo.getTierPriceMap(db, {
      orgId,
      tierIds,
      variantIds: input.variantIds.map(asVariantId),
    }),
    catalogRepo.getVariantsByIds(db, { orgId, variantIds: input.variantIds.map(asVariantId) }),
  ]);

  return input.variantIds.map((variantId) => {
    const variant = variantById.get(asVariantId(variantId));
    if (!variant) {
      throw new StockHubError('not_found', 'ไม่พบสินค้า', { variantId });
    }
    const resolution = resolvePrice({
      variantId: asVariantId(variantId),
      sellingPrice: satang(variant.sellingPrice),
      tierId,
      defaultTierId,
      tierPrices,
    });
    return {
      variantId: resolution.variantId,
      price: resolution.price,
      priceSource: resolution.source,
      ...(resolution.tierId ? { priceTierId: resolution.tierId } : {}),
    };
  });
};
