/**
 * Dashboard summary - the first screen of the demo.
 *
 * `stockValue` is the only cost field here. It disappears for stock_staff and
 * sales through ok(), which is exactly the moment the customer understands the
 * role feature.
 */

import { Hono } from 'hono';
import { MOCK_DASHBOARD } from '../lib/mock-data';
import { ok } from '../lib/response';
import { requirePermission } from '../middleware/require-permission';
import type { AppEnv } from '../types/app';
import type { DashboardSummary } from '../types/contract';

export const dashboardRouter = new Hono<AppEnv>().get(
  '/summary',
  requirePermission('stock:read'),
  (c) => {
    // MOCK: replace with one aggregate query per card. Real implementation:
    //   totalSkus       COUNT(variants)
    //   totalOnHand     SUM(stock_lots.remaining_qty)
    //   lowStockCount   COUNT(variants WHERE available <= low_stock_threshold)
    //   stockValue      SUM(remaining_qty * unit_cost)   -- cost field
    //   todaySold       SUM(-qty_delta) FROM stock_movements
    //                     WHERE reason = 'sale_out' AND occurred_at >= today
    //   pendingImports  COUNT(import_batches WHERE status = 'preview_ready')
    //   unmatchedSkus   COUNT(DISTINCT platform_sku WHERE match_source = 'unmatched')
    //   byChannel       GROUP BY channel for today
    // Run them in one Promise.all; a Worker has a CPU budget, not a time budget.
    const summary: DashboardSummary = MOCK_DASHBOARD;
    return ok(c, summary);
  },
);
