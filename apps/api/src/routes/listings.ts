/**
 * Listing write routes - the learned platform-SKU mappings.
 *
 * POST /          save a human match decision (import:run, the import preview's role)
 * GET /           list the learned mappings of the org, optionally per channel
 *
 * The POST is idempotent (upsert on channel + platform SKU), so it answers
 * 200 rather than 201: it is a save, not a fresh resource creation.
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
  .post('/', requirePermission('import:run'), validate('json', saveListingBody), async (c) =>
    ok(c, await saveListing(serviceContext(c), c.req.valid('json'))),
  )
  .get('/', requirePermission('stock:read'), validate('query', listListingsQuery), async (c) =>
    ok(c, await listListings(serviceContext(c), c.req.valid('query'))),
  );
