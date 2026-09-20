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

import { asChannelId, bundleAvailability, orderProfit, satang } from '@stockhub/core';
import {
  catalogRepo,
  channelRepo,
  importRepo,
  inventoryRepo,
  movementRepo,
  orderRepo,
} from '@stockhub/db';
import type {
  ChannelProfitRow,
  ChannelSalesReport,
  ChannelSalesRow,
  CogsReport,
  CogsReportRow,
  DashboardChannelStat,
  DashboardSummary,
  ProfitOrderRow,
  ProfitReport,
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

/**
 * GET /reports/cogs?from&to - sales, FIFO cost and margin per day and channel.
 *
 * `from`/`to` are Bangkok calendar dates; the query window is
 * [from midnight, to midnight + 1 day) so the `to` date is inclusive, which
 * is what the date pickers on the screen promise.
 */
export const getCogsReport = async (
  ctx: ServiceContext,
  query: { from: string; to: string; channelId?: string },
): Promise<CogsReport> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  const fromAt = new Date(`${query.from}T00:00:00+07:00`);
  const toAt = new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + MS_PER_DAY);

  const [groups, channels] = await Promise.all([
    movementRepo.listCogsByDayChannel(exec, { orgId, from: fromAt, to: toAt }),
    channelRepo.listChannels(exec, { orgId }),
  ]);
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const wanted = query.channelId ? asChannelId(query.channelId) : undefined;

  const rows: CogsReportRow[] = groups
    .filter((group) => wanted === undefined || group.channelId === wanted)
    .flatMap((group) => {
      const channel = channelById.get(group.channelId);
      if (!channel) return [];
      return [
        {
          date: group.day,
          channelId: group.channelId,
          channelName: channel.name,
          kind: channel.kind,
          unitsSold: group.unitsSold,
          revenue: satang(group.revenue),
          cogs: satang(group.cogs),
          margin: satang(group.revenue - group.cogs),
        },
      ];
    });

  const totals = rows.reduce(
    (acc, row) => ({
      unitsSold: acc.unitsSold + row.unitsSold,
      revenue: acc.revenue + row.revenue,
      cogs: acc.cogs + (row.cogs ?? 0),
      margin: acc.margin + (row.margin ?? 0),
    }),
    { unitsSold: 0, revenue: 0, cogs: 0, margin: 0 },
  );

  return {
    from: query.from,
    to: query.to,
    rows,
    totals: {
      unitsSold: totals.unitsSold,
      revenue: satang(totals.revenue),
      cogs: satang(totals.cogs),
      margin: satang(totals.margin),
    },
  };
};

/**
 * GET /reports/profit?from&to - per-order profit from the movement ledger.
 *
 * The whole response is cost data, so the route 403s for roles without
 * cost:read and ok()'s field stripping never fires - the COGS report's
 * situation exactly. The window matches getCogsReport: the `to` date is
 * inclusive on the wire because the SQL window ends at its Bangkok midnight
 * + 1 day. Rows are capped at the query's limit, but channelRows and totals
 * always cover the WHOLE window, so a short page can never skew the totals.
 */
export const getProfitReport = async (
  ctx: ServiceContext,
  query: { from: string; to: string; channelId?: string; limit: number },
): Promise<ProfitReport> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  const fromAt = new Date(`${query.from}T00:00:00+07:00`);
  const toAt = new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + MS_PER_DAY);
  const wanted = query.channelId ? asChannelId(query.channelId) : undefined;

  const ledger = await movementRepo.listProfitOrders(exec, {
    orgId,
    from: fromAt,
    to: toAt,
    channelId: wanted,
  });

  const rows: ProfitOrderRow[] = ledger.map((row) => {
    const profit = orderProfit({
      grandTotal: satang(row.grandTotal),
      platformFee: satang(row.platformFee),
      unitsSold: row.unitsSold,
      soldCost: satang(row.soldCost),
      restoredUnits: row.restoredUnits,
      restoredCost: satang(row.restoredCost),
    });
    return {
      id: row.orderId,
      externalOrderId: row.externalOrderId,
      channelId: row.channelId,
      channelName: row.channelName,
      channelKind: row.channelKind,
      status: row.status,
      orderedAt: row.orderedAt.toISOString(),
      unitsSold: row.unitsSold,
      unitsReturned: row.restoredUnits,
      revenue: profit.revenue,
      fee: profit.fee,
      cogs: profit.cogs,
      profit: profit.profit,
      feeSource: row.feeSource,
    };
  });

  // Group the full mapped set, summing field by field, so channelRows keep
  // whole-satang integers even when a page cut sits inside a channel.
  const byChannel = new Map<string, ChannelProfitRow>();
  for (const row of rows) {
    let agg = byChannel.get(row.channelId);
    if (!agg) {
      agg = {
        channelId: row.channelId,
        channelName: row.channelName,
        channelKind: row.channelKind,
        orders: 0,
        unitsSold: 0,
        unitsReturned: 0,
        revenue: 0,
        fee: 0,
        cogs: 0,
        profit: 0,
      };
      byChannel.set(row.channelId, agg);
    }
    agg.orders += 1;
    agg.unitsSold += row.unitsSold;
    agg.unitsReturned += row.unitsReturned;
    agg.revenue = satang(agg.revenue + row.revenue);
    agg.fee = satang((agg.fee ?? 0) + (row.fee ?? 0));
    agg.cogs = satang((agg.cogs ?? 0) + (row.cogs ?? 0));
    agg.profit = satang((agg.profit ?? 0) + (row.profit ?? 0));
  }
  // Biggest profit first; ties stay deterministic by channel id.
  const channelRows = [...byChannel.values()].sort(
    (a, b) => (b.profit ?? 0) - (a.profit ?? 0) || a.channelId.localeCompare(b.channelId),
  );

  const totals = {
    orders: rows.length,
    unitsSold: rows.reduce((sum, row) => sum + row.unitsSold, 0),
    unitsReturned: rows.reduce((sum, row) => sum + row.unitsReturned, 0),
    revenue: satang(rows.reduce((sum, row) => sum + row.revenue, 0)),
    fee: satang(rows.reduce((sum, row) => sum + (row.fee ?? 0), 0)),
    cogs: satang(rows.reduce((sum, row) => sum + (row.cogs ?? 0), 0)),
    profit: satang(rows.reduce((sum, row) => sum + (row.profit ?? 0), 0)),
  };

  return {
    from: query.from,
    to: query.to,
    channelId: query.channelId,
    ordersInWindow: rows.length,
    rows: rows.slice(0, query.limit),
    channelRows,
    totals,
  };
};
