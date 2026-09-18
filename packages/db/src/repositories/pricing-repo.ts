/**
 * Price tier reads and the tier-price matrix.
 *
 * The matrix is sparse by design (see src/schema/pricing.ts), so a read of a
 * customer's prices is really a read of a FEW cells plus fallbacks. That is why
 * `getTierPriceMap` takes tier ids (plural): the caller asks for the customer's
 * tier AND the default tier in one query and falls back in memory, in
 * resolvePrice(), not with extra round trips.
 */

import { type OrgId, type PriceTierId, type Satang, type VariantId, tierPriceKey } from '@stockhub/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type PriceTier, priceTierPrices, priceTiers, products, variants } from '../schema';

export const listTiers = async (exec: DbExecutor, params: { orgId: OrgId }): Promise<PriceTier[]> =>
  exec
    .select()
    .from(priceTiers)
    .where(eq(priceTiers.orgId, params.orgId))
    .orderBy(asc(priceTiers.sortOrder), asc(priceTiers.name));

/** The one tier flagged default, or undefined when the org has not picked one. */
export const getDefaultTier = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<PriceTier | undefined> => {
  const [row] = await exec
    .select()
    .from(priceTiers)
    .where(and(eq(priceTiers.orgId, params.orgId), eq(priceTiers.isDefault, true)))
    .limit(1);
  return row;
};

export interface GetTierPriceMapInput {
  orgId: OrgId;
  tierIds: readonly PriceTierId[];
  /** Narrow the cells to these variants; omit for every variant of the tiers. */
  variantIds?: readonly VariantId[];
}

/**
 * Tier price cells keyed by `tierPriceKey(tierId, variantId)`, the same key
 * format resolvePrice() looks up. Empty tier list short-circuits to an empty
 * map because `inArray` with an empty array is invalid SQL.
 */
export const getTierPriceMap = async (
  exec: DbExecutor,
  params: GetTierPriceMapInput,
): Promise<Map<string, Satang>> => {
  const map = new Map<string, Satang>();
  if (params.tierIds.length === 0) return map;
  const filters = [eq(priceTierPrices.orgId, params.orgId), inArray(priceTierPrices.priceTierId, [...params.tierIds])];
  if (params.variantIds && params.variantIds.length > 0) {
    filters.push(inArray(priceTierPrices.variantId, [...params.variantIds]));
  }
  const rows = await exec
    .select({
      priceTierId: priceTierPrices.priceTierId,
      variantId: priceTierPrices.variantId,
      price: priceTierPrices.price,
    })
    .from(priceTierPrices)
    .where(and(...filters));
  for (const row of rows) {
    map.set(tierPriceKey(row.priceTierId as PriceTierId, row.variantId as VariantId), row.price as Satang);
  }
  return map;
};

export interface UpsertTierPriceCell {
  variantId: VariantId;
  /** `null` deletes the cell so the variant falls back again. */
  price: Satang | null;
}

export interface UpsertTierPricesInput {
  orgId: OrgId;
  priceTierId: PriceTierId;
  prices: readonly UpsertTierPriceCell[];
}

/**
 * Write one tier's row of the matrix. Cells with a price are upserted in one
 * batch insert; cells with null are deleted in one statement. The tier must
 * belong to the org - the where clause guarantees an id from another tenant
 * cannot be written through.
 */
export const upsertTierPrices = async (
  exec: DbExecutor,
  params: UpsertTierPricesInput,
): Promise<{ upserted: number; deleted: number }> => {
  const toUpsert = params.prices.filter((cell) => cell.price !== null);
  const toDelete = params.prices.filter((cell) => cell.price === null);

  if (toUpsert.length > 0) {
    await exec
      .insert(priceTierPrices)
      .values(
        toUpsert.map((cell) => ({
          orgId: params.orgId,
          priceTierId: params.priceTierId,
          variantId: cell.variantId,
          price: cell.price as Satang,
        })),
      )
      .onConflictDoUpdate({
        target: [priceTierPrices.priceTierId, priceTierPrices.variantId],
        // `excluded.price` is the incoming row's value; raw SQL because drizzle
        // has no typed alias for the conflict source.
        set: { price: sql`excluded.price`, updatedAt: new Date() },
      });
  }

  let deleted = 0;
  if (toDelete.length > 0) {
    const rows = await exec
      .delete(priceTierPrices)
      .where(
        and(
          eq(priceTierPrices.orgId, params.orgId),
          eq(priceTierPrices.priceTierId, params.priceTierId),
          inArray(priceTierPrices.variantId, toDelete.map((cell) => cell.variantId)),
        ),
      )
      .returning({ id: priceTierPrices.id });
    deleted = rows.length;
  }

  return { upserted: toUpsert.length, deleted };
};

export interface PriceMatrixRow {
  variantId: VariantId;
  sku: string;
  name: string;
  sellingPrice: Satang;
  /** Sparse map: only tiers that actually have a cell for this variant. */
  prices: Partial<Record<PriceTierId, Satang>>;
}

/**
 * Every ACTIVE variant with the tier prices it has, for the matrix screen.
 * Two plain queries (variants, then all cells) merge in memory - a join would
 * duplicate every variant row per tier and the org has at most a handful of
 * tiers, so the merge is trivially cheap.
 */
export const listMatrix = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<PriceMatrixRow[]> => {
  const variantRows = await exec
    .select({
      id: variants.id,
      sku: variants.sku,
      productName: products.name,
      variantName: variants.name,
      sellingPrice: variants.sellingPrice,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.orgId, params.orgId), eq(variants.isActive, true)))
    .orderBy(asc(variants.sku));

  const cellRows = await exec
    .select({
      priceTierId: priceTierPrices.priceTierId,
      variantId: priceTierPrices.variantId,
      price: priceTierPrices.price,
    })
    .from(priceTierPrices)
    .where(eq(priceTierPrices.orgId, params.orgId));

  const cellsByVariant = new Map<VariantId, PriceMatrixRow['prices']>();
  for (const cell of cellRows) {
    const variantId = cell.variantId as VariantId;
    const tierId = cell.priceTierId as PriceTierId;
    const prices = cellsByVariant.get(variantId) ?? {};
    prices[tierId] = cell.price as Satang;
    cellsByVariant.set(variantId, prices);
  }

  return variantRows.map((row) => ({
    variantId: row.id as VariantId,
    sku: row.sku,
    name: row.variantName ? `${row.productName} (${row.variantName})` : row.productName,
    sellingPrice: row.sellingPrice as Satang,
    prices: cellsByVariant.get(row.id as VariantId) ?? {},
  }));
};
