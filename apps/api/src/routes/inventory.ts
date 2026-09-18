/**
 * Inventory: the shared stock pool that every channel sells from.
 *
 * Routes:
 *   GET /                              list + search + low stock filter
 *   GET /:variantId                    one variant with its FIFO lots
 *   GET /:variantId/movements          that variant's stock history
 *   POST /receive                      goods receipt (stock:adjust + cost:write)
 *   POST /adjust                       manual correction (stock:adjust)
 *
 * The list is the screen that proves the role feature: avgUnitCost and stockValue
 * are in the handler's payload and vanish in ok() for a role without cost:read.
 */

import { asVariantId } from '@stockhub/core';
import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import {
  adjustStockBody,
  listInventoryQuery,
  receiveStockBody,
  variantParam,
} from '../schemas/inventory';
import { listMovementsQuery } from '../schemas/movements';
import { serviceContext } from '../services/context';
import {
  adjustStock,
  getVariantDetail,
  listInventory,
  listMovements,
  receiveStock,
} from '../services/inventory-service';
import type { AppEnv } from '../types/app';

export const inventoryRouter = new Hono<AppEnv>()
  .get('/', requirePermission('stock:read'), validate('query', listInventoryQuery), async (c) => {
    return ok(c, await listInventory(serviceContext(c), c.req.valid('query')));
  })
  .get(
    '/:variantId',
    requirePermission('stock:read'),
    validate('param', variantParam),
    async (c) => {
      const { variantId } = c.req.valid('param');

      // Branded ids (asVariantId) are created at this boundary, never inside a service.
      return ok(c, await getVariantDetail(serviceContext(c), asVariantId(variantId)));
    },
  )
  .get(
    '/:variantId/movements',
    requirePermission('stock:read'),
    validate('param', variantParam),
    validate('query', listMovementsQuery),
    async (c) => {
      const { variantId } = c.req.valid('param');

      // The path param pins the variant and wins over the query string.
      return ok(c, await listMovements(serviceContext(c), { ...c.req.valid('query'), variantId }));
    },
  )
  .post(
    '/receive',
    // Receiving needs stock:adjust like any stock write; the cost side
    // (opening a FIFO lot) is additionally gated to cost:write in the service.
    requirePermission('stock:adjust'),
    validate('json', receiveStockBody),
    async (c) => ok(c, await receiveStock(serviceContext(c), c.req.valid('json')), 201),
  )
  .post(
    '/adjust',
    // Adjusting stock needs stock:adjust. Setting the cost of an inbound
    // adjustment additionally needs cost:write, checked inside the service.
    requirePermission('stock:adjust'),
    validate('json', adjustStockBody),
    async (c) => ok(c, await adjustStock(serviceContext(c), c.req.valid('json')), 201),
  );
