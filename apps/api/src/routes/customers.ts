/**
 * Customer routes.
 *
 *   GET    /             list + search (`customer:read`)
 *   GET    /:id          one customer (`customer:read`)
 *   POST   /             create (`customer:write`, 201)
 *   PATCH  /:id          partial update (`customer:write`)
 *
 * Everything tier-shaped in the response (priceTierId/Code/Name) is stripped
 * centrally for roles without `price_tier:read`; see types/contract-pricing.ts.
 */

import { asCustomerId } from '@stockhub/core';
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
  .get('/', requirePermission('customer:read'), validate('query', listCustomersQuery), async (c) =>
    ok(c, await listCustomers(serviceContext(c), c.req.valid('query'))),
  )
  .get('/:id', requirePermission('customer:read'), validate('param', customerParam), async (c) => {
    const { id } = c.req.valid('param');
    // Branded ids (asCustomerId) are created at this boundary, never inside a service.
    return ok(c, await getCustomer(serviceContext(c), asCustomerId(id)));
  })
  .post('/', requirePermission('customer:write'), validate('json', customerInput), async (c) =>
    ok(c, await createCustomer(serviceContext(c), c.req.valid('json')), 201),
  )
  .patch(
    '/:id',
    requirePermission('customer:write'),
    validate('param', customerParam),
    validate('json', customerInput),
    async (c) => {
      const { id } = c.req.valid('param');
      return ok(c, await updateCustomer(serviceContext(c), asCustomerId(id), c.req.valid('json')));
    },
  );
