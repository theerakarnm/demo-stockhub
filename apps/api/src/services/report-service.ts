/**
 * Dashboard summary + report read model.
 *
 * One service for every screen that answers "how much is left, what sold,
 * why did the balance move". All eight dashboard aggregates run in one
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
import {
  catalogRepo,
  channelRepo,
  importRepo,
  inventoryRepo,
  movementRepo,
  orderRepo,
} from '@stockhub/db';
import type {
  ChannelSalesReport,
  ChannelSalesRow,
  DashboardChannelStat,
  DashboardSummary,
  VarianceReasonTotal,
  VarianceReport,
  VarianceRow,
} from '../types/contract';
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
 * different stories. stockValue is a /** cost field */ /*: it travels in the
 * payload and ok() strips it for roles without cost:read.
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

/**
 * GET /reports/channel-sales?days=N - net sales per channel from orders and
 * order lines over the last N Bangkok days, today included.
 */
export const getChannelSalesReport = async (
  ctx: ServiceContext,
  query: { days: number },
): Promise<ChannelSalesReport> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  const now = ctx.clock.now();
  const from = bangkokDayStart(now, query.days - 1);

  const [sales, channels] = await Promise.all([
    orderRepo.sumChannelSales(exec, { orgId, from }),
    channelRepo.listChannels(exec, { orgId }),
  ]);
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));

  // Biggest seller first; a channel without an orders row cannot appear.
  const rows: ChannelSalesRow[] = sales.flatMap((sale) => {
    const channel = channelById.get(sale.channelId);
    if (!channel) return [];
    return [
      {
        channelId: sale.channelId,
        channelName: channel.name,
        kind: channel.kind,
        orders: sale.orders,
        unitsSold: sale.unitsSold,
        revenue: satang(sale.revenue),
      },
    ];
  });
  rows.sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold);

  return {
    days: query.days,
    from: from.toISOString(),
    to: now.toISOString(),
    rows,
    totals: rows.reduce(
      (acc, row) => ({
        orders: acc.orders + row.orders,
        unitsSold: acc.unitsSold + row.unitsSold,
        revenue: acc.revenue + row.revenue,
      }),
      { orders: 0, unitsSold: 0, revenue: 0 },
    ),
  };
};

/**
 * GET /reports/variance?days=N - the answer to ยอดคลาดเคลื่อนมาจากอะไร.
 *
 * Decision D4: every movement reason that is neither purchase_in nor
 * sale_out explains a balance change. The SQL groups by (variant, day,
 * reason); this merge folds the reasons into one row per (variant, day),
 * newest day first, biggest absolute movement first.
 */
export const getVarianceReport = async (
  ctx: ServiceContext,
  query: { days: number },
): Promise<VarianceReport> => {
  const now = ctx.clock.now();
  const from = bangkokDayStart(now, query.days - 1);
  const groups = await movementRepo.listVarianceGroups(ctx.db(), {
    orgId: ctx.auth.orgId,
    from,
  });

  const merged = new Map<string, VarianceRow>();
  for (const group of groups) {
    const key = `${group.variantId}|${group.day}`;
    let row = merged.get(key);
    if (!row) {
      row = {
        variantId: group.variantId,
        sku: group.sku,
        name: displayName(group.productName, group.variantName),
        day: group.day,
        qtyDelta: 0,
        movements: 0,
        byReason: [],
      };
      merged.set(key, row);
    }
    const reasonTotal: VarianceReasonTotal = {
      reason: group.reason,
      qtyDelta: group.qtyDelta,
      movements: group.movements,
    };
    row.qtyDelta += group.qtyDelta;
    row.movements += group.movements;
    row.byReason.push(reasonTotal);
  }

  const rows = [...merged.values()].sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      Math.abs(b.qtyDelta) - Math.abs(a.qtyDelta) ||
      a.sku.localeCompare(b.sku),
  );

  return { days: query.days, from: from.toISOString(), to: now.toISOString(), rows };
};
