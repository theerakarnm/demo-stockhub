/**
 * StockHub API - Worker entry point.
 *
 * Deliberately thin: wiring only. Request handling lives in src/routes, shared
 * rules in src/middleware, orchestration in src/services.
 *
 * ADD A ROUTE: create src/routes/<name>.ts, export it from routes/index.ts, and
 * mount it on `v1` below. Auth, db and cost hiding then apply automatically.
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { dbMiddleware } from './middleware/db';
import { errorHandler, notFoundHandler } from './middleware/error';
import { redactMiddleware } from './middleware/redact';
import { requestIdMiddleware } from './middleware/request-id';
import {
  catalogRouter,
  channelsRouter,
  customersRouter,
  dashboardRouter,
  healthRouter,
  importsRouter,
  inventoryRouter,
  listingsRouter,
  meRouter,
  movementsRouter,
  ordersRouter,
  priceTiersRouter,
  pricingRouter,
  reportsRouter,
} from './routes';
import type { AppEnv } from './types/app';

/** Everything under /api/v1 is authenticated and has a lazy db handle. */
const v1 = new Hono<AppEnv>()
  .use('*', authMiddleware)
  .use('*', dbMiddleware)
  .use('*', redactMiddleware)
  .route('/me', meRouter)
  .route('/channels', channelsRouter)
  .route('/dashboard', dashboardRouter)
  .route('/inventory', inventoryRouter)
  .route('/imports', importsRouter)
  .route('/orders', ordersRouter)
  .route('/movements', movementsRouter)
  .route('/reports', reportsRouter)
  .route('/catalog', catalogRouter)
  .route('/listings', listingsRouter)
  .route('/customers', customersRouter)
  .route('/price-tiers', priceTiersRouter)
  .route('/pricing', pricingRouter);

const app = new Hono<AppEnv>();

app.use('*', requestIdMiddleware);
app.use('*', logger());
app.use('/api/*', corsMiddleware);

// One error envelope for every failure: { error: { code, message, details? } }.
app.onError(errorHandler);
app.notFound(notFoundHandler);

// /health is outside /api/v1: no auth, no database, so a probe can always reach it.
app.route('/health', healthRouter);
app.route('/api/v1', v1);

/** Exported for `bun test` (see src/index.test.ts) and for typed RPC clients. */
export { app };
export type AppType = typeof app;

export default { fetch: app.fetch };
