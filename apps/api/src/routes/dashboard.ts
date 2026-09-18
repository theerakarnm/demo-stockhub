/**
 * Dashboard summary - the first screen of the demo.
 *
 * Every number is computed from the ledger the FIFO engine writes (see
 * report-service); no screen recomputes stock from another source. That is
 * the whole answer to "why do my numbers match now when Excel never did".
 *
 * `stockValue` is the only cost field here. It disappears for stock_staff and
 * sales through ok(), which is exactly the moment the customer understands the
 * role feature.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { requirePermission } from '../middleware/require-permission';
import { serviceContext } from '../services/context';
import { getDashboardSummary } from '../services/report-service';
import type { AppEnv } from '../types/app';

export const dashboardRouter = new Hono<AppEnv>().get(
  '/summary',
  requirePermission('stock:read'),
  async (c) => ok(c, await getDashboardSummary(serviceContext(c))),
);
