/**
 * Price resolution route.
 *
 *   GET /resolve?variantIds=a,b,c&customerId=... or &priceTierId=...
 *
 * The bill screen calls this once per customer change and reprices every line
 * from the answer, so the endpoint resolves the whole list in one round trip
 * and keeps the requested order.
 */

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
  async (c) => ok(c, await resolvePrices(serviceContext(c), c.req.valid('query'))),
);
