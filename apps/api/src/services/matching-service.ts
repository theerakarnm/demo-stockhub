/**
 * Catalog search + listing writes.
 *
 * Both jobs are pure orchestration: SQL lives in @stockhub/db repositories and
 * the matching rules in @stockhub/core. saving a listing is the preview
 * screen's "จับคู่" button: it persists the mapping AND re-matches the open
 * order lines in ONE transaction, so the preview and the learned mapping can
 * never disagree.
 */

import { StockHubError, asChannelId, asVariantId } from '@stockhub/core';
import type { VariantId } from '@stockhub/core';
import { catalogRepo, channelRepo, inventoryRepo, listingRepo } from '@stockhub/db';
import type {
  CatalogSearchRow,
  ListingView,
  SaveListingInput,
  SaveListingResult,
} from '../types/contract-catalog';
import type { ServiceContext } from './context';

/** Display name shared with the inventory service, so pickers read the same. */
const displayName = (productName: string, variantName: string | null): string =>
  variantName ? `${productName} (${variantName})` : productName;

/**
 * GET /catalog/search handler.
 *
 * The text match (catalogRepo.searchCatalog) and the live on-hand map
 * (inventoryRepo.getOnHandByVariant) are two reads on purpose: the search
 * stays a plain indexed ilike, and every picker row gets truthful stock from
 * the same source the inventory screen uses.
 */
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
 * POST /listings handler.
 *
 * One transaction: the channel_listings row and the re-matched order lines
 * land together or not at all. A half-saved listing would make the next import
 * match by itself while the current preview still shows the line as unmatched.
 */
export const saveListing = async (
  ctx: ServiceContext,
  input: SaveListingInput,
): Promise<SaveListingResult> =>
  ctx.db().transaction(async (tx): Promise<SaveListingResult> => {
    const orgId = ctx.auth.orgId;

    // The variant must belong to this org: a guessed id from another tenant is
    // a 404, never a cross-org write.
    const variantId = asVariantId(input.variantId);
    const variant = await catalogRepo.getVariantById(tx, { orgId, variantId });
    if (!variant) {
      throw new StockHubError('not_found', `Variant ${input.variantId} not found`, {
        variantId: input.variantId,
      });
    }

    const channels = await channelRepo.listChannels(tx, { orgId });
    const channel = channels.find((ch) => ch.id === input.channelId);
    if (!channel) {
      throw new StockHubError('not_found', `Channel ${input.channelId} not found`, {
        channelId: input.channelId,
      });
    }

    const listing = await listingRepo.upsertListing(tx, {
      orgId,
      channelId: asChannelId(channel.id),
      platformSku: input.platformSku,
      platformProductName: input.platformProductName,
      variantId,
      matchSource: 'manual',
    });
    const linesUpdated = await listingRepo.rematchOpenLines(tx, {
      orgId,
      channelId: asChannelId(channel.id),
      platformSku: input.platformSku,
      variantId,
    });
    return {
      listingId: listing.id,
      channelId: listing.channelId,
      platformSku: listing.platformSku,
      variantId: variant.id,
      linesUpdated,
    };
  });

/**
 * GET /listings handler.
 *
 * The repository returns raw channel_listings rows; the variant SKU is joined
 * here in one extra batched read so the screen can show "LZD-NEW-HAT-XL ->
 * HAT-01" without N+1 lookups.
 */
export const listListings = async (
  ctx: ServiceContext,
  channelId?: string,
): Promise<ListingView[]> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  const listings = await listingRepo.listListings(exec, {
    orgId,
    channelId: channelId ? asChannelId(channelId) : undefined,
  });

  const variantIds: VariantId[] = [];
  for (const row of listings) {
    if (row.variantId) variantIds.push(asVariantId(row.variantId));
  }
  const variantsById = await catalogRepo.getVariantsByIds(exec, { orgId, variantIds });

  return listings.map((row) => ({
    id: row.id,
    channelId: row.channelId,
    platformSku: row.platformSku,
    platformProductName: row.platformProductName,
    variantId: row.variantId,
    variantSku: row.variantId ? (variantsById.get(asVariantId(row.variantId))?.sku ?? null) : null,
    matchSource: row.matchSource,
  }));
};
