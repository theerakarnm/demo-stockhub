/**
 * Demo reset.
 *
 * Wipes every business table and writes the seed back, so a sales walkthrough
 * can be repeated from a known state. The write itself is `seedDatabase` from
 * @stockhub/db, the same function `bun run db:seed` uses, so the reset target
 * and the CLI target can never drift apart.
 *
 * WHY THIS IS NOT GUARDED BY DEMO_MODE: `DEMO_MODE=true` is exactly the state
 * in which the API trusts an unauthenticated `x-demo-role` header, and
 * wrangler.toml sets it on staging, which is deployed from main on every push.
 * Guarding a TRUNCATE with it would publish a database-wipe button to the
 * internet. The route therefore checks ENVIRONMENT instead, and this service
 * refuses to run for anything but `development`.
 */

import { StockHubError, satang } from '@stockhub/core';
import { seedDatabase } from '@stockhub/db';
import type { DemoResetResult } from '../types/contract';
import type { ServiceContext } from './context';

/**
 * The only environment where wiping the database is an acceptable outcome.
 * Deliberately not a list: every value added here is a new way to lose data.
 * Tests pass 'development' explicitly rather than widening this.
 */
export const isResettable = (environment: string): boolean => environment === 'development';

/**
 * Re-seed the org's database and report what the caller should now see.
 *
 * The counts come back from the same transaction that wrote them, so a caller
 * comparing them against the dashboard is comparing two reads of one write.
 */
export const resetDemoData = async (
  ctx: ServiceContext,
  environment: string,
): Promise<DemoResetResult> => {
  if (!isResettable(environment)) {
    // 404, not 403: outside development this endpoint should not appear to exist.
    throw new StockHubError('not_found', 'Not found');
  }

  const summary = await ctx.db().transaction((tx) => seedDatabase(tx));

  return {
    variantCount: summary.variants,
    lotCount: summary.lots,
    onHand: summary.units,
    stockValue: satang(summary.stockValue),
  };
};
