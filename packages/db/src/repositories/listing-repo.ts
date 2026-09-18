/**
 * Listings: learned platform-SKU mappings.
 *
 * A channel_listings row is a human decision ("on Lazada, LZD-NEW-HAT-XL is our
 * HAT-01"). Persisting it is what turns this month's painful import into next
 * month's automatic match: buildMatchIndex feeds these rows to matchSku() with
 * the highest priority.
 *
 * rematchOpenLines is the other half of the promise made on the preview screen:
 * saving a mapping also fixes every line of the current batch that is still
 * waiting (variant_id IS NULL), so the user never clicks twice for one file.
 */

import type { ChannelId, MatchSource, OrgId, VariantId } from '@stockhub/core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type ChannelListing, channelListings, orderLines, orders } from '../schema';

export interface UpsertListingInput {
  orgId: OrgId;
  channelId: ChannelId;
  /** SKU exactly as the platform export prints it. Stored verbatim. */
  platformSku: string;
  platformProductName?: string;
  /** Null means 'known listing we deliberately ignore' (e.g. a freebie). */
  variantId: VariantId | null;
  matchSource: MatchSource;
}

/**
 * Create or update the mapping for (channelId, platformSku).
 *
 * Idempotent by the channel_listings_channel_sku_uq unique index: saving the
 * same decision twice (double click, retried request) updates one row instead
 * of failing or duplicating.
 */
export const upsertListing = async (
  exec: DbExecutor,
  input: UpsertListingInput,
): Promise<ChannelListing> => {
  const [row] = await exec
    .insert(channelListings)
    .values({
      orgId: input.orgId,
      channelId: input.channelId,
      platformSku: input.platformSku,
      platformProductName: input.platformProductName,
      variantId: input.variantId,
      matchSource: input.matchSource,
    })
    .onConflictDoUpdate({
      target: [channelListings.channelId, channelListings.platformSku],
      set: {
        variantId: input.variantId,
        platformProductName: input.platformProductName,
        matchSource: input.matchSource,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error('upsertListing returned no row');
  return row;
};

export interface RematchOpenLinesParams {
  orgId: OrgId;
  channelId: ChannelId;
  platformSku: string;
  variantId: VariantId;
}

/**
 * Point every still-unmatched order line of this channel + platform SKU at the
 * given variant, marking them 'manual' (a human decision, not a guess).
 *
 * Only lines with variant_id IS NULL are touched: a line the matcher already
 * resolved keeps its original matchSource as the audit evidence. Returns how
 * many lines flipped, which is exactly the number the preview screen shows.
 */
export const rematchOpenLines = async (
  exec: DbExecutor,
  params: RematchOpenLinesParams,
): Promise<number> => {
  const flipped = await exec
    .update(orderLines)
    .set({ variantId: params.variantId, matchSource: 'manual' })
    .where(
      and(
        eq(orderLines.orgId, params.orgId),
        eq(orderLines.platformSku, params.platformSku),
        isNull(orderLines.variantId),
        inArray(
          orderLines.orderId,
          exec.select({ id: orders.id }).from(orders).where(eq(orders.channelId, params.channelId)),
        ),
      ),
    )
    .returning({ id: orderLines.id });
  return flipped.length;
};

/**
 * Every listing of the org, newest decisions first per channel; optionally
 * narrowed to one channel for the channel detail screen.
 */
export const listListings = async (
  exec: DbExecutor,
  params: { orgId: OrgId; channelId?: ChannelId },
): Promise<ChannelListing[]> =>
  exec
    .select()
    .from(channelListings)
    .where(
      params.channelId
        ? and(
            eq(channelListings.orgId, params.orgId),
            eq(channelListings.channelId, params.channelId),
          )
        : eq(channelListings.orgId, params.orgId),
    )
    .orderBy(asc(channelListings.channelId), asc(channelListings.platformSku));
