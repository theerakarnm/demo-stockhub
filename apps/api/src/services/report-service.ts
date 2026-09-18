/**
 * Dashboard summary + report read model.
 *
 * One service for every screen that answers "how much is left, what sold,
 * why did the balance move". The eight dashboard aggregates run in one
 * Promise.all: a Worker has a CPU budget, not a wall-clock budget, and the
 * queries are independent reads.
 *
 * Bangkok time: the org (see the seed) reports in Asia/Bangkok, so "today"
 * and every day bucket is a Bangkok calendar day. The boundaries are built
 * here as UTC instants of Bangkok midnights, and the SQL buckets use the
 * same time zone (see movement-repo), so window edges and bucket labels can
 * never disagree by an hour.
 */

import { bundleAvailability, satang } from '@stockhub/core';
import { catalogRepo, importRepo, inventoryRepo, movementRepo, orderRepo } from '@stockhub/db';
import type { DashboardChannelStat, DashboardSummary } from '../types/contract';
import type { ServiceContext } from './context';

const MS_PER_DAY = 86_400_000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * UTC instant of Bangkok midnight, `minusDays` days before the Bangkok
 * calendar date of `at`. Working in "Bangkok seconds since epoch" avoids any
 * Intl dependency: floor(now + 7h) to whole days, then subtract the offset.
 */
export const bangkokDayStart = (at: Date, minusDays = 0): Date =>
  new Date(
    Math.floor((at.getTime() + BANGKOK_OFFSET_MS) / MS_PER_DAY - minusDays) * MS_PER_DAY -
      BANGKOK_OFFSET_MS,
  );

/** Display name shared with the inventory and movement screens. */
const displayName = (productName: string, variantName: string | null): string =>
  variantName ? `${productName} (${variantName})` : productName;

/**
 * GET /dashboard/summary - the eight aggregates from the route comment.
 *
 * lowStockCount applies the same bundle-aware availability overlay as the
 * inventory list (bundleAvailability over its components' on-hand), so the
 * "สินค้าใกล้หมด" tile and the inventory low-stock filter can never tell two
 * different stories. stockValue is a cost field (see COST_KEYS in core): it
 * travels in the payload and ok() strips it for roles without cost:read.
 */
export const getDashboardSummary = async (ctx: ServiceContext): Promise<DashboardSummary> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  const todayStart = bangkokDayStart(ctx.clock.now());

  const [positions, componentsByBundle, todayUnits, channelToday, pendingImports, unmatchedSkus] =
    await Promise.all([
      inventoryRepo.getStockPositionByVariant(exec, { orgId }),
      catalogRepo.getBundleComponentMap(exec, { orgId }),
      movementRepo.sumUnitsSoldSince(exec, { orgId, since: todayStart }),
      movementRepo.sumSalesByChannelSince(exec, { orgId, since: todayStart }),
      importRepo.countBatchesByStatus(exec, { orgId, status: 'preview_ready' }),
      orderRepo.countDistinctUnmatchedSkus(exec, { orgId }),
    ]);

  const onHandByVariant = new Map(positions.map((row) => [row.variantId, row.onHand]));
  const lowStockCount = positions.filter((row) => {
    const recipe = row.kind === 'bundle' ? (componentsByBundle.get(row.variantId) ?? []) : null;
    const available = recipe
      ? bundleAvailability(recipe, onHandByVariant)
      : row.onHand - row.reserved;
    return available <= row.reorderPoint;
  }).length;

  const byChannel: DashboardChannelStat[] = channelToday.map((row) => ({
    channelId: row.channelId,
    kind: row.kind,
    name: row.name,
    unitsSoldToday: row.unitsSold,
    revenueToday: satang(row.revenue),
  }));

  return {
    totalSkus: positions.length,
    totalOnHand: positions.reduce((sum, row) => sum + row.onHand, 0),
    lowStockCount,
    stockValue: satang(positions.reduce((sum, row) => sum + row.stockValue, 0)),
    todaySold: todayUnits,
    pendingImports,
    unmatchedSkus,
    byChannel,
  };
};
