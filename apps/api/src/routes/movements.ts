/**
 * Stock movement history across every variant - the "why is my number this"
 * screen. Every stock change in the system has exactly one row here, which is
 * what makes the ledger auditable.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { listMovementsQuery } from '../schemas/movements';
import { serviceContext } from '../services/context';
import { listMovements } from '../services/inventory-service';
import type { AppEnv } from '../types/app';

export const movementsRouter = new Hono<AppEnv>().get(
  '/',
  requirePermission('stock:read'),
  validate('query', listMovementsQuery),
  async (c) => ok(c, await listMovements(serviceContext(c), c.req.valid('query'))),
);
