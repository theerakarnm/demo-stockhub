/**
 * Channel summaries for the settings screen and the import channel picker.
 *
 * `lastImportedAt` is the part worth explaining: it is MAX(applied_at) over
 * the channel's import batches, so "นำเข้าล่าสุดเมื่อไร" is answered from the
 * same ledger every other screen reads, never from a hand-maintained field.
 */

import { type Channel as ChannelRow, channelRepo } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import type { Channel } from '../types/contract';
import type { ServiceContext } from './context';

export const listChannelSummaries = async (ctx: ServiceContext): Promise<Channel[]> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;

  const channels: ChannelRow[] = await channelRepo.listChannels(exec, { orgId });
  // postgres.js resolves to the row array itself, not a { rows } envelope.
  const lastApplied = (await exec.execute(sql`
    select channel_id, max(applied_at) as last_applied_at
    from import_batches
    where org_id = ${orgId} and applied_at is not null
    group by channel_id
  `)) as unknown as Array<{ channel_id: string; last_applied_at: string | null }>;
  const lastByChannel = new Map(lastApplied.map((row) => [row.channel_id, row.last_applied_at]));

  return channels.map((channel) => ({
    id: channel.id,
    kind: channel.kind,
    name: channel.name,
    isActive: channel.isActive,
    lastImportedAt: lastByChannel.get(channel.id) ?? null,
  }));
};
