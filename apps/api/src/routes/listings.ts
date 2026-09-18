/**
 * Listing routes - the learned platform-SKU mappings behind automatic matching.
 *
 * Routes:
 *   POST /    save a mapping (import:run); re-matches this channel's still
 *             unmatched order lines in the same transaction
 *   GET /     list mappings (stock:read), optionally for one channel
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { listListingsQuery, saveListingBody } from '../schemas/catalog';
import { serviceContext } from '../services/context';
import { listListings, saveListing } from '../services/matching-service';
import type { AppEnv } from '../types/app';

export const listingsRouter = new Hono<AppEnv>()
  .post(
    '/',
    // Saving a mapping is a write to the import pipeline, not to stock, so it
    // is gated like the rest of the import flow.
    requirePermission('import:run'),
    validate('json', saveListingBody),
    async (c) => ok(c, await saveListing(serviceContext(c), c.req.valid('json')), 201),
  )
  .get('/', requirePermission('stock:read'), validate('query', listListingsQuery), async (c) => {
    const { channelId } = c.req.valid('query');
    return ok(c, await listListings(serviceContext(c), channelId));
  });
