/**
 * Price resolution routes.
 *
 *   GET /resolve?variantIds=a,b&customerId=x|priceTierId=y  (price_tier:read)
 *
 * One price per variant in the order requested; the bill screen calls this
 * whenever the picked customer changes or a line is added.
 */

import { asCustomerId, asPriceTierId, asVariantId } from '@stockhub/core';
import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { resolveQuery } from '../schemas/pricing';
import { serviceContext } from '../services/context';
import { resolvePrices } from '../services/pricing-service';
import type { AppEnv } from '../types/app';

export const pricingRouter = new Hono<AppEnv>().get(
  '/resolve',
  requirePermission('price_tier:read'),
  validate('query', resolveQuery),
  async (c) => {
    const query = c.req.valid('query');
    return ok(
      c,
      await resolvePrices(serviceContext(c), {
        variantIds: query.variantIds.map(asVariantId),
        ...(query.customerId !== undefined && { customerId: asCustomerId(query.customerId) }),
        ...(query.priceTierId !== undefined && { priceTierId: asPriceTierId(query.priceTierId) }),
      }),
    );
  },
);
