/**
 * GET /channels - the sales channels behind the one stock pool.
 *
 * Reads the seeded channels from the database. This used to return
 * MOCK_CHANNELS, whose string ids ("ch_shopee_main") are not seed uuids - the
 * import picker filled its dropdown from here, so picking one and uploading
 * failed with not_found. The guided demo uploads real files through this list.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { requirePermission } from '../middleware/require-permission';
import { listChannelSummaries } from '../services/channel-service';
import { serviceContext } from '../services/context';
import type { AppEnv } from '../types/app';

export const channelsRouter = new Hono<AppEnv>().get(
  '/',
  requirePermission('stock:read'),
  async (c) => ok(c, await listChannelSummaries(serviceContext(c))),
);
