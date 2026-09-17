/**
 * Channels = the 6 online stores + the physical shop, all sharing one stock pool.
 */

import { Hono } from 'hono';
import { MOCK_CHANNELS } from '../lib/mock-data';
import { ok } from '../lib/response';
import { requirePermission } from '../middleware/require-permission';
import type { AppEnv } from '../types/app';
import type { Channel } from '../types/contract';

export const channelsRouter = new Hono<AppEnv>().get('/', requirePermission('stock:read'), (c) => {
  // MOCK: replace with `SELECT * FROM channels WHERE org_id = $orgId ORDER BY kind, name`
  // plus MAX(import_batches.applied_at) per channel for lastImportedAt.
  const channels: Channel[] = MOCK_CHANNELS;
  return ok(c, channels);
});
