/**
 * Catalogue reads, plus the lookup index the import matcher runs on.
 *
 * `buildMatchIndex` is the only place that turns database rows into the
 * `MatchIndex` shape from @stockhub/core. Build it ONCE per import file, not
 * once per row: a 2,000 line Shopee export would otherwise issue 2,000 queries.
 */

import {
  type ChannelId,
  type BundleComponent as DomainBundleComponent,
  type MatchCandidate,
  type MatchIndex,
  NotImplementedError,
  type OrgId,
  type VariantId,
  asVariantId,
  listingKey,
  normaliseSku,
} from '@stockhub/core';
import { and, asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type Variant, bundleComponents, channelListings, products, variants } from '../schema';

export const getVariantBySku = async (
  exec: DbExecutor,
  params: { orgId: OrgId; sku: string },
): Promise<Variant | undefined> => {
  const [row] = await exec
    .select()
    .from(variants)
    .where(and(eq(variants.orgId, params.orgId), eq(variants.sku, params.sku)))
    .limit(1);
  return row;
};

export interface CatalogRow {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  kind: 'simple' | 'bundle';
  unit: string;
  sellingPrice: number;
  reorderPoint: number;
}

/** Flat product + variant list for the catalogue screen and the SKU picker. */
export const listCatalog = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<CatalogRow[]> =>
  exec
    .select({
      variantId: variants.id,
      sku: variants.sku,
      productName: products.name,
      variantName: variants.name,
      kind: variants.kind,
      unit: variants.unit,
      sellingPrice: variants.sellingPrice,
      reorderPoint: variants.reorderPoint,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.orgId, params.orgId), eq(variants.isActive, true)))
    .orderBy(asc(products.name), asc(variants.sku));

/** Recipe of every bundle in the org, ready for expandBundles(). */
export const getBundleComponentMap = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<Map<VariantId, DomainBundleComponent[]>> => {
  const rows = await exec
    .select({
      bundleVariantId: bundleComponents.bundleVariantId,
      componentVariantId: bundleComponents.componentVariantId,
      qtyPerBundle: bundleComponents.qtyPerBundle,
    })
    .from(bundleComponents)
    .where(eq(bundleComponents.orgId, params.orgId));

  const map = new Map<VariantId, DomainBundleComponent[]>();
  for (const row of rows) {
    const key = asVariantId(row.bundleVariantId);
    const list = map.get(key) ?? [];
    list.push({
      componentVariantId: asVariantId(row.componentVariantId),
      qtyPerBundle: row.qtyPerBundle,
    });
    map.set(key, list);
  }
  return map;
};

/**
 * Build the in-memory index used by matchSku().
 *
 * Three lookups, in the priority order documented in
 * core/services/import/matching.ts:
 *   listingMap        channel + platform SKU -> variant (a human decision)
 *   bySku             exact internal SKU
 *   byNormalisedSku   upper-cased, separators stripped; can hit more than one
 *                     variant, which is why the value is an array - the UI must
 *                     then ask instead of guessing.
 */
export const buildMatchIndex = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<MatchIndex> => {
  const variantRows = await exec
    .select({
      id: variants.id,
      sku: variants.sku,
      productName: products.name,
      variantName: variants.name,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.orgId, params.orgId), eq(variants.isActive, true)));

  const bySku = new Map<string, MatchCandidate>();
  const byNormalisedSku = new Map<string, MatchCandidate[]>();

  for (const row of variantRows) {
    const candidate: MatchCandidate = {
      variantId: asVariantId(row.id),
      sku: row.sku,
      name: row.variantName ? `${row.productName} (${row.variantName})` : row.productName,
    };
    bySku.set(row.sku, candidate);

    const normalised = normaliseSku(row.sku);
    const bucket = byNormalisedSku.get(normalised) ?? [];
    bucket.push(candidate);
    byNormalisedSku.set(normalised, bucket);
  }

  const listingRows = await exec
    .select({
      channelId: channelListings.channelId,
      platformSku: channelListings.platformSku,
      variantId: channelListings.variantId,
    })
    .from(channelListings)
    .where(eq(channelListings.orgId, params.orgId));

  const listingMap = new Map<string, VariantId>();
  for (const row of listingRows) {
    // A listing with a null variant is a deliberate 'ignore this SKU' marker.
    if (!row.variantId) continue;
    listingMap.set(
      listingKey(row.channelId as ChannelId, row.platformSku),
      asVariantId(row.variantId),
    );
  }

  return { listingMap, bySku, byNormalisedSku };
};

/**
 * Create or update a product together with its variants.
 *
 * TODO(template): one transaction, upsert the product, then upsert each variant
 * on (org_id, sku). Reject a bundle whose component is itself a bundle - nested
 * bundles make availability recursive and the demo does not need them.
 */
export const upsertProduct = async (_exec: DbExecutor, _input: unknown): Promise<never> => {
  throw new NotImplementedError('upsertProduct');
};
