/**
 * Reports.
 *
 * COGS is the one endpoint where the whole response is cost data, so it is
 * blocked by permission (403) instead of being stripped field by field. A
 * stripped COGS report would be an empty table, which is worse than an honest
 * "you may not see this". Channel sales and variance are quantity and selling
 * money, so any role that may read orders or stock may read them too.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { channelSalesQuery, cogsReportQuery, varianceQuery } from '../schemas/reports';
import { serviceContext } from '../services/context';
import {
  getChannelSalesReport,
  getCogsReport,
  getVarianceReport,
} from '../services/report-service';
import type { AppEnv } from '../types/app';

export const reportsRouter = new Hono<AppEnv>()
  .get(
    '/channel-sales',
    requirePermission('order:read'),
    validate('query', channelSalesQuery),
    async (c) => ok(c, await getChannelSalesReport(serviceContext(c), c.req.valid('query'))),
  )
  .get('/variance', requirePermission('stock:read'), validate('query', varianceQuery), async (c) =>
    ok(c, await getVarianceReport(serviceContext(c), c.req.valid('query'))),
  )
  .get(
    '/cogs',
    // Both permissions: you must be allowed to read reports AND to see cost.
    requirePermission('report:read', 'cost:read'),
    validate('query', cogsReportQuery),
    async (c) => ok(c, await getCogsReport(serviceContext(c), c.req.valid('query'))),
  );
