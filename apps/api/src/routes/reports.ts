/**
 * Reports.
 *
 * COGS is the one endpoint where the whole response is cost data, so it is
 * blocked by permission (403) instead of being stripped field by field. A
 * stripped COGS report would be an empty table, which is worse than an honest
 * "you may not see this".
 */

import { Hono } from 'hono';
import { mockCogsReport } from '../lib/mock-data';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { cogsReportQuery } from '../schemas/reports';
import type { AppEnv } from '../types/app';
import type { CogsReport } from '../types/contract';

export const reportsRouter = new Hono<AppEnv>().get(
  '/cogs',
  // Both permissions: you must be allowed to read reports AND to see cost.
  requirePermission('report:read', 'cost:read'),
  validate('query', cogsReportQuery),
  (c) => {
    const { from, to } = c.req.valid('query');

    // MOCK: replace with an aggregate over stock_movements joined to
    // movement_lot_consumptions:
    //   SELECT date_trunc('day', m.occurred_at) AS day, m.channel_id,
    //          SUM(-m.qty_delta)  AS units_sold,
    //          SUM(ol.line_total) AS revenue,
    //          SUM(m.cost_total)  AS cogs
    //     FROM stock_movements m ...
    //    WHERE m.reason = 'sale_out' AND m.occurred_at BETWEEN $from AND $to
    //    GROUP BY day, m.channel_id
    // Returns cost in satang; the UI formats with formatMoney().
    const report: CogsReport = mockCogsReport(from, to);
    return ok(c, report);
  },
);
