/**
 * Catalog search routes.
 *
 * GET /search - the SKU picker behind the order screen and the import
 * preview's variant picker. Read-only, so `stock:read` is enough; selling
 * prices are not cost fields and are visible to every role.
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
