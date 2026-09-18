/**
 * Customers and pricing: the read models behind the customers screen, the
 * price matrix and the bill screen.
 *
 * Pure orchestration - SQL lives in @stockhub/db repositories, the tier
 * fallback rule in @stockhub/core's resolvePrice. Tier fields are returned
 * like any other field; stripping them for roles without price_tier:read is
 * the response layer's job (Track E wires PRICE_TIER_KEYS into it).
 */

import {
  StockHubError,
  asCustomerId,
  asPriceTierId,
  asVariantId,
  resolvePrice,
  satang,
} from '@stockhub/core';
import type { CustomerId, PriceTierId, VariantId } from '@stockhub/core';
import { catalogRepo, customerRepo, pricingRepo } from '@stockhub/db';
import type { DbExecutor } from '@stockhub/db';
import type { CustomerInput, ListCustomersQuery, PutTierPricesBody } from '../schemas/pricing';
import type {
  CustomerView,
  PriceMatrixRow,
  PriceResolutionView,
  PriceTierView,
} from '../types/contract';
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

/** One row of pricingRepo.listTiers. */
type TierRow = Awaited<ReturnType<typeof pricingRepo.listTiers>>[number];

/** One row of pricingRepo.listMatrix. */
type MatrixRow = Awaited<ReturnType<typeof pricingRepo.listMatrix>>[number];

/** Map a tier row onto the wire. */
export const toPriceTierView = (row: TierRow): PriceTierView => ({
  id: row.id,
  code: row.code,
  name: row.name,
  sortOrder: row.sortOrder,
  isDefault: row.isDefault,
});

/** `prices` in the repo row is named `tierPrices` on the wire. */
export const toPriceMatrixRow = (row: MatrixRow): PriceMatrixRow => ({
  variantId: row.variantId,
  sku: row.sku,
  name: row.name,
  sellingPrice: row.sellingPrice,
  tierPrices: row.prices,
});

export const listTiers = async (ctx: ServiceContext): Promise<PriceTierView[]> => {
  const rows = await pricingRepo.listTiers(ctx.db(), { orgId: ctx.auth.orgId });
  return rows.map(toPriceTierView);
};

/** Every active variant with every tier price - the matrix screen's one read. */
export const listMatrix = async (ctx: ServiceContext): Promise<PriceMatrixRow[]> => {
  const rows = await pricingRepo.listMatrix(ctx.db(), { orgId: ctx.auth.orgId });
  return rows.map(toPriceMatrixRow);
};

/** Save one tier column: a foreign tier id is caller error, not a 500. */
export const putTierPrices = async (
  ctx: ServiceContext,
  tierId: string,
  body: PutTierPricesBody,
): Promise<{ upserted: number; deleted: number }> => {
  await assertTierInOrg(ctx, tierId);
  return pricingRepo.upsertTierPrices(ctx.db(), {
    orgId: ctx.auth.orgId,
    priceTierId: asPriceTierId(tierId),
    prices: body.prices.map((cell) => ({
      variantId: asVariantId(cell.variantId),
      price: cell.price === null ? null : satang(cell.price),
    })),
  });
};

export interface ResolvePricesInput {
  variantIds: VariantId[];
  customerId?: CustomerId;
  priceTierId?: PriceTierId;
}

/**
 * Resolve one price per variant, in the order requested.
 *
 * The customer's tier (or the explicit tier) and the org default tier feed one
 * price map, then core's resolvePrice falls back per variant. `exec` lets the
 * bill service run this inside its own transaction (Track P).
 */
export const resolvePrices = async (
  ctx: ServiceContext,
  input: ResolvePricesInput,
  exec?: DbExecutor,
): Promise<PriceResolutionView[]> => {
  const db = exec ?? ctx.db();
  let tierId: PriceTierId | undefined = input.priceTierId;
  if (tierId === undefined && input.customerId !== undefined) {
    const customer = await customerRepo.getCustomer(db, {
      orgId: ctx.auth.orgId,
      customerId: input.customerId,
    });
    tierId = customer?.priceTierId !== null && customer?.priceTierId !== undefined
      ? asPriceTierId(customer.priceTierId)
      : undefined;
  }
  const defaultTier = await pricingRepo.getDefaultTier(db, { orgId: ctx.auth.orgId });
  const defaultTierId = defaultTier ? asPriceTierId(defaultTier.id) : undefined;
  // One map for both tiers so resolvePrice can fall back entirely in memory.
  const tierIds = [...new Set([...(tierId ? [tierId] : []), ...(defaultTierId ? [defaultTierId] : [])])];
  const [tierPrices, variantById] = await Promise.all([
    pricingRepo.getTierPriceMap(db, {
      orgId: ctx.auth.orgId,
      tierIds,
      variantIds: input.variantIds,
    }),
    catalogRepo.getVariantsByIds(db, { orgId: ctx.auth.orgId, variantIds: input.variantIds }),
  ]);
  return input.variantIds.map((variantId) => {
    const variant = variantById.get(variantId);
    if (!variant) {
      throw new StockHubError('not_found', `Variant ${variantId} not found`, { variantId });
    }
    const resolution = resolvePrice({
      variantId,
      sellingPrice: satang(variant.sellingPrice),
      tierId,
      defaultTierId,
      tierPrices,
    });
    return {
      variantId,
      price: resolution.price,
      priceSource: resolution.source,
      ...(resolution.tierId !== undefined && { priceTierId: resolution.tierId }),
    };
  });
};
