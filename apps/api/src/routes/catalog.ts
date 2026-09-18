/**
 * Catalog search routes.
 *
 * Routes:
 *   GET /search    free-text search over SKU / product name / variant label,
 *                  with live on-hand per row - the picker behind the POS bill
 *                  and the import preview.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { catalogSearchQuery } from '../schemas/catalog';
import { serviceContext } from '../services/context';
import { searchCatalog } from '../services/matching-service';
import type { AppEnv } from '../types/app';

export const catalogRouter = new Hono<AppEnv>().get(
  '/search',
  requirePermission('stock:read'),
  validate('query', catalogSearchQuery),
  async (c) => {
    const { q, limit } = c.req.valid('query');
    return ok(c, await searchCatalog(serviceContext(c), q, limit));
  },
);
