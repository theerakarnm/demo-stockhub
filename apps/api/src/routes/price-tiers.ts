/**
 * Price tier routes.
 *
 *   GET  /               list the org's tiers           (price_tier:read)
 *   GET  /matrix         whole price matrix             (price_tier:read)
 *   PUT  /:tierId/prices save one tier column, batched  (price_tier:write)
 *
 * Tier fields ride along in the payload; stripping them for roles without
 * price_tier:read is the response layer's job (Track E), not this router's.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { putTierPricesBody, tierParam } from '../schemas/pricing';
import { serviceContext } from '../services/context';
import { listMatrix, listTiers, putTierPrices } from '../services/pricing-service';
import type { AppEnv } from '../types/app';

export const priceTiersRouter = new Hono<AppEnv>()
  .get(
    '/',
    requirePermission('price_tier:read'),
    async (c) => ok(c, await listTiers(serviceContext(c))),
  )
  .get(
    '/matrix',
    requirePermission('price_tier:read'),
    async (c) => ok(c, await listMatrix(serviceContext(c))),
  )
  .put(
    '/:tierId/prices',
    requirePermission('price_tier:write'),
    validate('param', tierParam),
    validate('json', putTierPricesBody),
    async (c) =>
      ok(c, await putTierPrices(serviceContext(c), c.req.valid('param').tierId, c.req.valid('json'))),
  );
