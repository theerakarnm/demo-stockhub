/**
 * Catalog search and learned-listing writes.
 *
 * The search is the SKU picker's backend; the listing write is what the import
 * preview calls when a human resolves an unmatched line. Both are pure
 * orchestration: SQL in @stockhub/db repositories, matching rules in
 * @stockhub/core.
 */

import { StockHubError, asChannelId, asVariantId } from '@stockhub/core';
import { catalogRepo, channelRepo, inventoryRepo, listingRepo } from '@stockhub/db';
import type { ListListingsQuery } from '../schemas/catalog';
import type {
  CatalogSearchRow,
  ListingView,
  SaveListingInput,
  SaveListingResult,
} from '../types/contract-catalog';
import type { ServiceContext } from './context';

/** Display name shared with the inventory rows, so pickers render identically. */
const displayName = (productName: string, variantName: string | null): string =>
  variantName ? `${productName} (${variantName})` : productName;

/** Free-text catalog search with on-hand quantity overlaid from the stock pool. */
export const searchCatalog = async (
  ctx: ServiceContext,
  q: string,
  limit: number,
): Promise<CatalogSearchRow[]> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;

  const [rows, onHandByVariant] = await Promise.all([
    catalogRepo.searchCatalog(exec, { orgId, q, limit }),
    inventoryRepo.getOnHandByVariant(exec, { orgId }),
  ]);

  return rows.map((row) => ({
    variantId: row.variantId,
    sku: row.sku,
    name: displayName(row.productName, row.variantName),
    kind: row.kind,
    unit: row.unit,
    sellingPrice: row.sellingPrice,
    onHand: onHandByVariant.get(asVariantId(row.variantId)) ?? 0,
  }));
};

/**
 * Remember a human SKU decision and back-fill the open order lines.
 *
 * One transaction on purpose: if the rematch fails, the learned listing must
 * not survive either, or the next import would match lines nobody approved.
 * Returns the rematch count so the preview screen can show what changed.
 */
export const saveListing = async (
  ctx: ServiceContext,
  input: SaveListingInput,
): Promise<SaveListingResult> => {
  const db = ctx.db();
  const orgId = ctx.auth.orgId;
  const variantId = asVariantId(input.variantId);
  const channelId = asChannelId(input.channelId);

  const variant = await catalogRepo.getVariantById(db, { orgId, variantId });
  if (!variant) {
    throw new StockHubError('not_found', `Variant ${input.variantId} not found`, {
      variantId: input.variantId,
    });
  }

  // The channel must belong to the same org - a listing keyed to another
  // tenant's channel would be invisible to the matcher and silently useless.
  const channels = await channelRepo.listChannels(db, { orgId });
  const channel = channels.find((row) => row.id === input.channelId);
  if (!channel) {
    throw new StockHubError('not_found', `Channel ${input.channelId} not found`, {
      channelId: input.channelId,
    });
  }

  return db.transaction(async (tx) => {
    const listing = await listingRepo.upsertListing(tx, {
      orgId,
      channelId,
      platformSku: input.platformSku,
      platformProductName: input.platformProductName,
      variantId,
      matchSource: 'manual',
    });
    const linesUpdated = await listingRepo.rematchOpenLines(tx, {
      orgId,
      channelId,
      platformSku: input.platformSku,
      variantId,
    });
    return {
      listingId: listing.id,
      channelId,
      platformSku: listing.platformSku,
      variantId,
      linesUpdated,
    };
  });
};

/** The learned mappings of the org, resolved to variant SKUs for display. */
export const listListings = async (
  ctx: ServiceContext,
  query: ListListingsQuery,
): Promise<ListingView[]> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;

  const rows = await listingRepo.listListings(exec, {
    orgId,
    channelId: query.channelId ? asChannelId(query.channelId) : undefined,
  });
  // null variantId is the 'ignore this SKU' marker; it has no SKU to show.
  const variantsById = await catalogRepo.getVariantsByIds(exec, {
    orgId,
    variantIds: rows
      .map((row) => row.variantId)
      .filter((id): id is NonNullable<typeof id> => id !== null)
      .map((id) => asVariantId(id)),
  });

  return rows.map((row) => ({
    id: row.id,
    channelId: row.channelId,
    platformSku: row.platformSku,
    platformProductName: row.platformProductName,
    variantId: row.variantId,
    variantSku: row.variantId ? (variantsById.get(asVariantId(row.variantId))?.sku ?? null) : null,
    matchSource: row.matchSource,
  }));
};
