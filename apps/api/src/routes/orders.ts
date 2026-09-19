/**
 * Orders.
 *
 *   GET  /            list every order, marketplace and local, one shared view
 *   GET  /:id         one bill with its lines
 *   POST /            create a POS or wholesale bill (the only order this API
 *                     creates itself - marketplace orders arrive via /imports)
 *   POST /:id/cancel  reverse a bill: the exact FIFO slices of the sale go back
 *   POST /:id/return  accept a full or partial customer return
 *   PATCH /:id/fee    set the platform fee of one bill by hand (cost:write)
 *
 * Reading an order needs `order:read`; writing one needs `order:create`, the
 * same permission the till already holds. Cost fields (cogs, margin, line
 * totalCost) are still stripped for a `sales` role by lib/response.ts, so the
 * shop floor sees the bill but not the margin.
 */

import { asOrderId, satang } from '@stockhub/core';
import { Hono } from 'hono';
import { ok, paginated } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import {
  cancelOrderBody,
  createOrderBody,
  listOrdersQuery,
  orderParam,
  returnOrderBody,
  setOrderFeeBody,
} from '../schemas/orders';
import { serviceContext } from '../services/context';
import {
  cancelOrder,
  createPosOrder,
  getOrder,
  listOrders,
  returnOrder,
  setOrderFee,
} from '../services/order-service';
import type { AppEnv } from '../types/app';

export const ordersRouter = new Hono<AppEnv>()
  .get('/', requirePermission('order:read'), validate('query', listOrdersQuery), async (c) => {
    const page = await listOrders(serviceContext(c), c.req.valid('query'));
    return paginated(c, page.items, page.nextCursor);
  })

  .get('/:id', requirePermission('order:read'), validate('param', orderParam), async (c) => {
    const order = await getOrder(serviceContext(c), asOrderId(c.req.valid('param').id));
    return ok(c, order);
  })

  .post('/', requirePermission('order:create'), validate('json', createOrderBody), async (c) => {
    // Wired to the real service: it consumes FIFO lots inside one transaction and
    // throws InsufficientStockError (HTTP 409) rather than overselling.
    const order = await createPosOrder(serviceContext(c), c.req.valid('json'));
    return ok(c, order, 201);
  })

  .post(
    '/:id/cancel',
    requirePermission('order:create'),
    validate('param', orderParam),
    validate('json', cancelOrderBody),
    async (c) => {
      const { id } = c.req.valid('param');
      const { reason } = c.req.valid('json');
      const movements = await cancelOrder(serviceContext(c), asOrderId(id), reason);
      return ok(c, movements);
    },
  )

  .post(
    '/:id/return',
    requirePermission('order:create'),
    validate('param', orderParam),
    validate('json', returnOrderBody),
    async (c) => {
      const { id } = c.req.valid('param');
      const { lines } = c.req.valid('json');
      const movements = await returnOrder(serviceContext(c), asOrderId(id), lines);
      return ok(c, movements);
    },
  )

  .patch(
    '/:id/fee',
    // The fee is money the shop pays, so writing it needs cost:write, the same
    // permission that guards editing costs elsewhere.
    requirePermission('cost:write'),
    validate('param', orderParam),
    validate('json', setOrderFeeBody),
    async (c) =>
      ok(
        c,
        await setOrderFee(
          serviceContext(c),
          asOrderId(c.req.valid('param').id),
          satang(c.req.valid('json').fee),
        ),
      ),
  );
