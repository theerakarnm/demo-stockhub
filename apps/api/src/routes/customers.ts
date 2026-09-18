/**
 * Customer endpoints.
 *
 *   GET   /            list + search (customer:read)
 *   GET   /:customerId one customer          (customer:read)
 *   POST  /            create                (customer:write)
 *   PATCH /:customerId edit                  (customer:write)
 *
 * Tier fields ride along in the payload; stripping them for roles without
 * price_tier:read is Track E's job in the response layer, not this router's.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { customerInput, customerParam, listCustomersQuery } from '../schemas/pricing';
import { serviceContext } from '../services/context';
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from '../services/pricing-service';
import type { AppEnv } from '../types/app';

export const customersRouter = new Hono<AppEnv>()
  .get(
    '/',
    requirePermission('customer:read'),
    validate('query', listCustomersQuery),
    async (c) => ok(c, await listCustomers(serviceContext(c), c.req.valid('query'))),
  )
  .get(
    '/:customerId',
    requirePermission('customer:read'),
    validate('param', customerParam),
    async (c) => ok(c, await getCustomer(serviceContext(c), c.req.valid('param').customerId)),
  )
  .post(
    '/',
    requirePermission('customer:write'),
    validate('json', customerInput),
    async (c) => ok(c, await createCustomer(serviceContext(c), c.req.valid('json')), 201),
  )
  .patch(
    '/:customerId',
    requirePermission('customer:write'),
    validate('param', customerParam),
    validate('json', customerInput),
    async (c) =>
      ok(
        c,
        await updateCustomer(serviceContext(c), c.req.valid('param').customerId, c.req.valid('json')),
      ),
  );
