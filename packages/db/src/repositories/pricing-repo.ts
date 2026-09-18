/**
 * Price tiers and the per-tier price matrix.
 *
 * Reads feed the price resolver in @stockhub/core: the caller loads the tiers,
 * the default tier and a `tierPriceKey`-keyed price map, then resolves each
 * bill line in memory. `upsertTierPrices` is the write path behind the matrix
 * screen: one batched upsert for set prices and one batched delete for cleared
 * cells, so saving a whole column is two statements, not 500.
 */

import {
  type OrgId,
  type PriceTierId,
  type Satang,
  type VariantId,
  asPriceTierId,
  asVariantId,
  satang,
  tierPriceKey,
} from '@stockhub/core';
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import {
  type PriceTier,
  type PriceTierPrice,
  priceTierPrices,
  priceTiers,
  variants,
} from '../schema';

export const listTiers = async (exec: DbExecutor, params: { orgId: OrgId }): Promise<PriceTier[]> =>
  exec
    .select()
    .from(priceTiers)
    .where(eq(priceTiers.orgId, params.orgId))
    .orderBy(asc(priceTiers.sortOrder), asc(priceTiers.name));

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

/** Tier prices keyed by `tierPriceKey(tierId, variantId)`, ready for resolvePrice. */
export const getTierPriceMap = async (
  exec: DbExecutor,
  params: { orgId: OrgId; tierIds: readonly PriceTierId[]; variantIds?: readonly VariantId[] },
): Promise<Map<string, Satang>> => {
  const map = new Map<string, Satang>();
  // inArray with an empty list is invalid SQL, so answer before querying.
  if (params.tierIds.length === 0) return map;
  const filters = [
    eq(priceTierPrices.orgId, params.orgId),
    inArray(priceTierPrices.priceTierId, [...params.tierIds]),
  ];
  if (params.variantIds) {
    if (params.variantIds.length === 0) return map;
    filters.push(inArray(priceTierPrices.variantId, [...params.variantIds]));
  }
  const rows = await exec
    .select({
      tierId: priceTierPrices.priceTierId,
      variantId: priceTierPrices.variantId,
      price: priceTierPrices.price,
    })
    .from(priceTierPrices)
    .where(and(...filters));
  for (const row of rows) {
    map.set(tierPriceKey(asPriceTierId(row.tierId), asVariantId(row.variantId)), satang(row.price));
  }
  return map;
};

export interface TierPriceCellInput {
  variantId: VariantId;
  /** null clears the tier price so resolution falls back for that variant. */
  price: Satang | null;
}

/**
 * Save one tier column of the matrix: upsert the set prices, delete the
 * cleared ones. Returns how many rows each statement touched.
 */
export const upsertTierPrices = async (
  exec: DbExecutor,
  params: { orgId: OrgId; priceTierId: PriceTierId; prices: readonly TierPriceCellInput[] },
): Promise<{ upserted: number; deleted: number }> => {
  const isSetPrice = (cell: TierPriceCellInput): cell is { variantId: VariantId; price: Satang } =>
    cell.price !== null;

  const toUpsert = params.prices.filter(isSetPrice);
  const toDelete = params.prices
    .filter((cell) => cell.price === null)
    .map((cell) => cell.variantId);

  let upserted = 0;
  let deleted = 0;

  if (toUpsert.length > 0) {
    const rows = await exec
      .insert(priceTierPrices)
      .values(
        toUpsert.map((cell) => ({
          orgId: params.orgId,
          priceTierId: params.priceTierId,
          variantId: cell.variantId,
          price: cell.price,
        })),
      )
      .onConflictDoUpdate({
        target: [priceTierPrices.priceTierId, priceTierPrices.variantId],
        set: { price: sql`excluded.price`, updatedAt: new Date() },
      })
      .returning({ id: priceTierPrices.id });
    upserted = rows.length;
  }

  if (toDelete.length > 0) {
    const rows = await exec
      .delete(priceTierPrices)
      .where(
        and(
          eq(priceTierPrices.orgId, params.orgId),
          eq(priceTierPrices.priceTierId, params.priceTierId),
          inArray(priceTierPrices.variantId, toDelete),
        ),
      )
      .returning({ id: priceTierPrices.id });
    deleted = rows.length;
  }

  return { upserted, deleted };
};

export interface MatrixRow {
  variantId: VariantId;
  sku: string;
  name: string;
  sellingPrice: Satang;
  /** Tier id -> price in satang; a missing key means "no price set on the tier". */
  prices: Record<string, number>;
}

/** Every active variant with its tier prices - the whole matrix in one call. */
export const listMatrix = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<MatrixRow[]> => {
  const variantRows = await exec
    .select({
      id: variants.id,
      sku: variants.sku,
      name: variants.name,
      sellingPrice: variants.sellingPrice,
    })
    .from(variants)
    .where(and(eq(variants.orgId, params.orgId), eq(variants.isActive, true)))
    .orderBy(asc(variants.sku));

  const priceRows = await exec
    .select({
      variantId: priceTierPrices.variantId,
      tierId: priceTierPrices.priceTierId,
      price: priceTierPrices.price,
    })
    .from(priceTierPrices)
    .where(eq(priceTierPrices.orgId, params.orgId));

  const pricesByVariant = new Map<string, Record<string, number>>();
  for (const row of priceRows) {
    const bucket = pricesByVariant.get(row.variantId) ?? {};
    bucket[row.tierId] = row.price;
    pricesByVariant.set(row.variantId, bucket);
  }

  return variantRows.map((row) => ({
    variantId: asVariantId(row.id),
    sku: row.sku,
    name: row.name ?? '',
    sellingPrice: satang(row.sellingPrice),
    prices: pricesByVariant.get(row.id) ?? {},
  }));
};
