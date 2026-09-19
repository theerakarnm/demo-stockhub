/**
 * POST /demo/reset - put the demo database back to its opening state.
 *
 * Only mounted for the guided demo. The environment check lives in the service
 * (see the comment there for why it is not DEMO_MODE), and the permission check
 * keeps the shape of every other write route: a role that may not adjust stock
 * may not wipe it either.
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import { requirePermission } from '../middleware/require-permission';
import { serviceContext } from '../services/context';
import { resetDemoData } from '../services/demo-service';
import type { AppEnv } from '../types/app';

export const demoRouter = new Hono<AppEnv>().post(
  '/reset',
  requirePermission('stock:adjust'),
  async (c) => ok(c, await resetDemoData(serviceContext(c), c.env.ENVIRONMENT)),
);
