/**
 * Stock movement history across every variant - the "why is my number this"
 * screen. Every stock change in the system has exactly one row here, which is
 * what makes the ledger auditable.
 */

import { Hono } from 'hono';
import { MOCK_MOVEMENTS } from '../lib/mock-data';
import { paginated } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { listMovementsQuery } from '../schemas/movements';
import type { AppEnv } from '../types/app';

export const movementsRouter = new Hono<AppEnv>().get(
  '/',
  requirePermission('stock:read'),
  validate('query', listMovementsQuery),
  (c) => {
    const { variantId, reason, from, to, limit } = c.req.valid('query');

    // MOCK: replace with `await listMovements(serviceContext(c), c.req.valid('query'))`.
    // Real query: keyset pagination on (occurred_at DESC, id DESC) with the same
    // four filters, joined to variants for sku/name.
    const items = MOCK_MOVEMENTS.filter((movement) => {
      const day = movement.occurredAt.slice(0, 10);
      return (
        (!variantId || movement.variantId === variantId) &&
        (!reason || movement.reason === reason) &&
        (!from || day >= from) &&
        (!to || day <= to)
      );
    }).slice(0, limit);

    return paginated(c, items, null);
  },
);
