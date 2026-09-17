/**
 * Orders.
 *
 *   GET  /            list every order, marketplace and local, one shared view
 *   POST /            create a POS or wholesale bill (the only order this API
 *                     creates itself - marketplace orders arrive via /imports)
 *
 * Reading an order needs `order:read`. Cost fields (cogs, margin, line totalCost)
 * are still stripped for a `sales` role, so the shop floor sees the bill but not
 * the margin. Access and field visibility are two different rules.
 */

import { Hono } from 'hono';
import { MOCK_ORDERS } from '../lib/mock-data';
import { ok, paginated } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { createOrderBody, listOrdersQuery } from '../schemas/orders';
import { serviceContext } from '../services/context';
import { createPosOrder } from '../services/order-service';
import type { AppEnv } from '../types/app';

export const ordersRouter = new Hono<AppEnv>()
  .get('/', requirePermission('order:read'), validate('query', listOrdersQuery), (c) => {
    const { channelId, status, limit } = c.req.valid('query');

    // MOCK: replace with `await listOrders(serviceContext(c), c.req.valid('query'))`.
    // Real query: orders WHERE org_id = $orgId (+ filters), keyset paginated on
    // (ordered_at DESC, id DESC), lines fetched in a second query by order id.
    const items = MOCK_ORDERS.filter(
      (order) =>
        (!channelId || order.channelId === channelId) && (!status || order.status === status),
    ).slice(0, limit);

    return paginated(c, items, null);
  })

  .post('/', requirePermission('order:create'), validate('json', createOrderBody), async (c) => {
    // Wired to the real service: it consumes FIFO lots inside one transaction and
    // throws InsufficientStockError (HTTP 409) rather than overselling.
    const order = await createPosOrder(serviceContext(c), c.req.valid('json'));
    return ok(c, order, 201);
  });
