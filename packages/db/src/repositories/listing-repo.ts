/**
 * Listings: learned platform-SKU mappings.
 *
 * Every time a human resolves an unmatched line on the import preview screen we
 * write a channel_listings row with `matchSource = 'manual'`, so the NEXT
 * import matches by itself. That is why the upsert is idempotent on
 * (channelId, platformSku) and why saving a mapping also back-fills the open
 * order lines that are still waiting on that SKU.
 */

import type { ChannelId, MatchSource, OrgId, VariantId } from '@stockhub/core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type ChannelListing, channelListings, orderLines, orders } from '../schema';

export const upsertListing = async (
  exec: DbExecutor,
  input: {
    orgId: OrgId;
    channelId: ChannelId;
    platformSku: string;
    platformProductName?: string;
    variantId: VariantId | null;
    matchSource: MatchSource;
  },
): Promise<ChannelListing> => {
  const [row] = await exec
    .insert(channelListings)
    .values({
      orgId: input.orgId,
      channelId: input.channelId,
      platformSku: input.platformSku,
      platformProductName: input.platformProductName ?? null,
      variantId: input.variantId,
      matchSource: input.matchSource,
    })
    .onConflictDoUpdate({
      target: [channelListings.channelId, channelListings.platformSku],
      set: {
        variantId: input.variantId,
        platformProductName: input.platformProductName ?? null,
        matchSource: input.matchSource,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error('Upsert into channel_listings returned no row');
  return row;
};

/**
 * Point every still-unmatched order line of this platform SKU at the variant
 * the user just chose. Only lines whose order belongs to the channel are
 * touched - the same SKU can mean different variants on different shops.
 */
export const rematchOpenLines = async (
  exec: DbExecutor,
  params: { orgId: OrgId; channelId: ChannelId; platformSku: string; variantId: VariantId },
): Promise<number> => {
  const updated = await exec
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
  return updated.length;
};

/** The learned mappings of an org, optionally narrowed to one channel. */
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
    .orderBy(asc(channelListings.platformSku));
