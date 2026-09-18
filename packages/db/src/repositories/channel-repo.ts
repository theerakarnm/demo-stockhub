/**
 * Sales channel reads.
 *
 * Every function takes a `DbExecutor` so the caller decides whether the query
 * runs on the pool or inside a transaction. Both reads filter by `orgId` and
 * stay ordering-stable, so screens and imports list channels the same way on
 * every render.
 */

import type { ChannelKind, OrgId } from '@stockhub/core';
import { and, asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type Channel, channels } from '../schema';

/** Every channel of the org, ordered by kind then name for a stable picker. */
export const listChannels = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<Channel[]> =>
  exec
    .select()
    .from(channels)
    .where(eq(channels.orgId, params.orgId))
    .orderBy(asc(channels.kind), asc(channels.name));

/** First active channel of the given kind, e.g. the POS till behind the counter. */
export const getChannelByKind = async (
  exec: DbExecutor,
  params: { orgId: OrgId; kind: ChannelKind },
): Promise<Channel | undefined> => {
  const [row] = await exec
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.orgId, params.orgId),
        eq(channels.kind, params.kind),
        eq(channels.isActive, true),
      ),
    )
    .limit(1);
  return row;
};
