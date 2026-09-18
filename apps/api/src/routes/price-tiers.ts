/**
 * Price tier routes.
 *
 *   GET  /           the org's tiers in display order (`price_tier:read`)
 *   GET  /matrix     every active variant with its tier cells (`price_tier:read`)
 *   PUT  /:id/prices  write one tier's row of the matrix (`price_tier:write`)
 *
 * The matrix is the whole payload because the screen edits it as one table;
 * 18 variants x a handful of tiers fits comfortably in a Worker response.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { putTierPricesBody, tierParam } from '../schemas/pricing';
import { serviceContext } from '../services/context';
import { getMatrix, listTiers, putTierPrices } from '../services/pricing-service';
import type { AppEnv } from '../types/app';

export const priceTiersRouter = new Hono<AppEnv>()
  .get('/', requirePermission('price_tier:read'), async (c) =>
    ok(c, await listTiers(serviceContext(c))),
  )
  .get('/matrix', requirePermission('price_tier:read'), async (c) =>
    ok(c, await getMatrix(serviceContext(c))),
  )
  .put(
    '/:id/prices',
    requirePermission('price_tier:write'),
    validate('param', tierParam),
    validate('json', putTierPricesBody),
    async (c) => {
      const { id } = c.req.valid('param');
      return ok(c, await putTierPrices(serviceContext(c), id, c.req.valid('json').prices));
    },
  );
