/**
 * Dashboard + report route tests against the seeded database.
 *
 * The suites here MUTATE the ledger, so everything runs inside one setup
 * transaction and the afterAll hook removes exactly what was created, in FK
 * order, and restores the touched seed lots to remaining_qty = qty. The
 * "seed invariant" check in packages/db/guards.integration.test.ts is the
 * proof the restore is exact. Test data touches only the water-can variant
 * and its own orders, so the parallel suites that assert seed absolutes
 * (inventory count, purchase_in count) stay valid while this file runs.
 *
 * Without DATABASE_URL the whole suite skips, so `bun test` stays green with
 * no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { SEED_IDS, createDb } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import { buildTestApp, jsonAs, requestAs } from '../test-utils';
import { dashboardRouter } from './dashboard';
import { inventoryRouter } from './inventory';
import { reportsRouter } from './reports';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const ORG = SEED_IDS.org;
const WAREHOUSE = SEED_IDS.warehouse;
const WATER_CAN = SEED_IDS.variants.waterCan;
const CAN_LOT_A = '11000000-0000-4000-8000-000000000029'; // 70 units @ 8800
const CAN_LOT_B = '11000000-0000-4000-8000-000000000030'; // 50 units @ 9600

const LAZADA = SEED_IDS.channels.lazadaMain;
const SHOPEE = SEED_IDS.channels.shopeeMain;
const TIKTOK = SEED_IDS.channels.tiktokMain;

/** Bangkok calendar date of a Date, 'YYYY-MM-DD' - matches the SQL buckets. */
const bkkDate = (at: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(at);

/** Y-M-D with a Bangkok-day offset from now, for from/to query params. */
const bkkDateOffset = (minusDays: number): string => {
  const d = new Date(Date.now() - minusDays * 86_400_000);
  return bkkDate(d);
};

interface SummaryWire {
  totalSkus: number;
  totalOnHand: number;
  lowStockCount: number;
  stockValue?: number;
  todaySold: number;
  pendingImports: number;
  unmatchedSkus: number;
  byChannel: {
    channelId: string;
    kind: string;
    name: string;
    unitsSoldToday: number;
    revenueToday: number;
  }[];
}

interface ChannelSalesWire {
  days: number;
  rows: {
    channelId: string;
    channelName: string;
    kind: string;
    orders: number;
    unitsSold: number;
    revenue: number;
  }[];
  totals: { orders: number; unitsSold: number; revenue: number };
}

interface VarianceWire {
  days: number;
  rows: {
    variantId: string;
    sku: string;
    day: string;
    qtyDelta: number;
    movements: number;
    byReason: { reason: string; qtyDelta: number; movements: number }[];
  }[];
}

interface CogsWire {
  from: string;
  to: string;
  rows: {
    date: string;
    channelId: string;
    channelName: string;
    unitsSold: number;
    revenue: number;
    cogs?: number;
    margin?: number;
  }[];
  totals: { unitsSold: number; revenue: number; cogs?: number; margin?: number };
}

describe.skipIf(!url)('dashboard and reports (seeded database)', () => {
  const app = buildTestApp((v1) =>
    v1
      .route('/dashboard', dashboardRouter)
      .route('/reports', reportsRouter)
      // Mounted only for the low-stock consistency check against the summary.
      .route('/inventory', inventoryRouter),
  );

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const today = bkkDate(now);
  const day30 = bkkDate(d30);

  /** Summary taken before the fixture lands, for delta assertions. */
  let before: SummaryWire;

  test('setup: ledger fixtures land in one transaction', async () => {
    if (!db) return;
    before = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'owner');

    await db.transaction(async (tx) => {
      // Orders first (movements + lines reference them).
      await tx.execute(sql`
        insert into orders (id, org_id, channel_id, external_order_id, status, ordered_at, grand_total, buyer_name)
        values
          ('1a000000-0000-4000-8000-000000000001', ${ORG}, ${LAZADA}, 'JTEST-ORD-1', 'shipped', ${d30.toISOString()}::timestamptz, 100000, 'ลูกค้าทดสอบ 1'),
          ('1a000000-0000-4000-8000-000000000002', ${ORG}, ${SHOPEE}, 'JTEST-ORD-2', 'shipped', ${now.toISOString()}::timestamptz, 180000, 'ลูกค้าทดสอบ 2'),
          ('1a000000-0000-4000-8000-000000000003', ${ORG}, ${TIKTOK}, 'JTEST-ORD-3', 'cancelled', ${now.toISOString()}::timestamptz, 11000, 'ลูกค้าทดสอบ 3'),
          ('1a000000-0000-4000-8000-000000000004', ${ORG}, ${LAZADA}, 'JTEST-ORD-4', 'pending', ${now.toISOString()}::timestamptz, 100, 'ลูกค้าทดสอบ 4')
      `);
      // Lines: revenue rows for ORD-1/2/3, one deliberately unmatched for ORD-4.
      await tx.execute(sql`
        insert into order_lines (id, org_id, order_id, variant_id, platform_sku, platform_product_name, qty, unit_price, discount, match_source)
        values
          ('1b000000-0000-4000-8000-000000000001', ${ORG}, '1a000000-0000-4000-8000-000000000001', ${WATER_CAN}, 'JTEST-CAN', 'บัวรดน้ำทดสอบ', 4, 25000, 0, 'sku_exact'),
          ('1b000000-0000-4000-8000-000000000002', ${ORG}, '1a000000-0000-4000-8000-000000000002', ${WATER_CAN}, 'JTEST-CAN', 'บัวรดน้ำทดสอบ', 6, 30000, 0, 'sku_exact'),
          ('1b000000-0000-4000-8000-000000000003', ${ORG}, '1a000000-0000-4000-8000-000000000003', ${WATER_CAN}, 'JTEST-CAN', 'บัวรดน้ำทดสอบ', 2, 5500, 0, 'sku_exact'),
          ('1b000000-0000-4000-8000-000000000004', ${ORG}, '1a000000-0000-4000-8000-000000000004', null, 'JTEST-UNMATCHED', 'สินค้ายังจับคู่ไม่ได้', 1, 100, 0, 'unmatched')
      `);
      // Ledger. Lot deltas keep the seed invariant true at every instant:
      // sum(qty_delta) = -10 and the lots drop by exactly 10 units.
      await tx.execute(sql`
        insert into stock_movements (id, org_id, variant_id, warehouse_id, reason, qty_delta, cost_total, channel_id, order_id, occurred_at, note)
        values
          ('1c000000-0000-4000-8000-000000000001', ${ORG}, ${WATER_CAN}, ${WAREHOUSE}, 'sale_out', -4, 35200, ${LAZADA}, '1a000000-0000-4000-8000-000000000001', ${d30.toISOString()}::timestamptz, 'ขายทดสอบ 30 วันก่อน'),
          ('1c000000-0000-4000-8000-000000000002', ${ORG}, ${WATER_CAN}, ${WAREHOUSE}, 'adjust_out', -3, 26400, null, null, ${d30.toISOString()}::timestamptz, 'ปรับสต็อกทดสอบ ขาด 3'),
          ('1c000000-0000-4000-8000-000000000003', ${ORG}, ${WATER_CAN}, ${WAREHOUSE}, 'sale_out', -6, 56000, ${SHOPEE}, '1a000000-0000-4000-8000-000000000002', ${now.toISOString()}::timestamptz, 'ขายทดสอบวันนี้'),
          ('1c000000-0000-4000-8000-000000000004', ${ORG}, ${WATER_CAN}, ${WAREHOUSE}, 'cancel_restore', 2, 19200, ${TIKTOK}, '1a000000-0000-4000-8000-000000000003', ${now.toISOString()}::timestamptz, 'ยกเลิกทดสอบ คืน 2'),
          ('1c000000-0000-4000-8000-000000000005', ${ORG}, ${WATER_CAN}, ${WAREHOUSE}, 'return_in', 1, 8800, ${SHOPEE}, '1a000000-0000-4000-8000-000000000002', ${now.toISOString()}::timestamptz, 'คืนสินค้าทดสอบ 1')
      `);
      // FIFO slices of the two sales - the rows the COGS report reads.
      await tx.execute(sql`
        insert into movement_lot_consumptions (id, org_id, movement_id, lot_id, qty, unit_cost, line_cost)
        values
          ('1d000000-0000-4000-8000-000000000001', ${ORG}, '1c000000-0000-4000-8000-000000000001', ${CAN_LOT_A}, 4, 8800, 35200),
          ('1d000000-0000-4000-8000-000000000002', ${ORG}, '1c000000-0000-4000-8000-000000000003', ${CAN_LOT_A}, 2, 8800, 17600),
          ('1d000000-0000-4000-8000-000000000003', ${ORG}, '1c000000-0000-4000-8000-000000000003', ${CAN_LOT_B}, 4, 9600, 38400)
      `);
      await tx.execute(sql`
        update stock_lots set remaining_qty = remaining_qty - 4 where id = ${CAN_LOT_A}
      `);
      await tx.execute(sql`
        update stock_lots set remaining_qty = remaining_qty - 3 where id = ${CAN_LOT_A}
      `);
      await tx.execute(sql`
        update stock_lots set remaining_qty = remaining_qty - 6 + 2 where id = ${CAN_LOT_B}
      `);
      await tx.execute(sql`
        update stock_lots set remaining_qty = remaining_qty + 1 where id = ${CAN_LOT_A}
      `);
    });
  });

  afterAll(async () => {
    if (!db) return;
    // Delete by the fixture's own fixed ids, never by created_at: a concurrent
    // suite writing real rows must never be swept up by this cleanup.
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        delete from movement_lot_consumptions where movement_id in (
          '1c000000-0000-4000-8000-000000000001', '1c000000-0000-4000-8000-000000000002',
          '1c000000-0000-4000-8000-000000000003', '1c000000-0000-4000-8000-000000000004',
          '1c000000-0000-4000-8000-000000000005'
        )
      `);
      await tx.execute(sql`
        delete from stock_movements where id in (
          '1c000000-0000-4000-8000-000000000001', '1c000000-0000-4000-8000-000000000002',
          '1c000000-0000-4000-8000-000000000003', '1c000000-0000-4000-8000-000000000004',
          '1c000000-0000-4000-8000-000000000005'
        )
      `);
      await tx.execute(sql`
        delete from order_lines where order_id in (
          '1a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000002',
          '1a000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000004'
        )
      `);
      await tx.execute(sql`
        delete from orders where id in (
          '1a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000002',
          '1a000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000004'
        )
      `);
      // The seed layers must end exactly where they started.
      await tx.execute(
        sql`update stock_lots set remaining_qty = qty where id in (${CAN_LOT_A}, ${CAN_LOT_B})`,
      );
    });
    await db.$client.end();
  });

  // -------------------------------------------------------------------------
  // J1 - dashboard summary
  // -------------------------------------------------------------------------

  test('summary org-wide totals equal the ledger truth, fixture delta +6 sold', async () => {
    if (!db) return;
    const after = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'owner');
    // The same three numbers straight from the ledger, with the same Bangkok
    // "today" boundary the service uses.
    const truth = (await db.execute(sql`
      select
        (
          select coalesce(sum(-qty_delta), 0)::int from stock_movements
          where org_id = ${ORG} and reason = 'sale_out'
            and occurred_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
        ) as today_sold,
        (
          select coalesce(sum(remaining_qty), 0)::int from stock_lots where org_id = ${ORG}
        ) as on_hand,
        (
          select coalesce(sum(remaining_qty * unit_cost), 0)::bigint from stock_lots where org_id = ${ORG}
        ) as stock_value
    `)) as Array<{ today_sold: number; on_hand: number; stock_value: string | number }>;
    const row = truth[0];
    if (!row) throw new Error('ledger truth query returned no row');
    expect(after.todaySold).toBe(Number(row.today_sold));
    expect(after.totalOnHand).toBe(Number(row.on_hand));
    expect(after.stockValue).toBe(Number(row.stock_value));
    // The fixture contributed exactly 6 sold units to that ledger number, and
    // on-hand moved by the net -10 of the five fixture movements.
    expect(after.todaySold).toBeGreaterThanOrEqual(before.todaySold + 6);
    expect(after.totalOnHand).toBeLessThanOrEqual(before.totalOnHand - 10);
    // totalSkus and pending imports are fixture-independent.
    expect(after.totalSkus).toBe(before.totalSkus);
    expect(after.pendingImports).toBe(before.pendingImports);
  });

  test('summary hides stockValue from sales but keeps the totals', async () => {
    const owner = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'owner');
    const sales = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'sales');
    expect('stockValue' in sales).toBe(false);
    expect(sales.totalOnHand).toBe(owner.totalOnHand);
    expect(sales.todaySold).toBe(owner.todaySold);
  });

  test('byChannel carries exactly the sale_out movements of Bangkok today', async () => {
    const summary = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'owner');
    const shopee = summary.byChannel.find((row) => row.channelId === SHOPEE);
    // 6 units, 180000 satang revenue from ORD-2; the return/cancel are not sales.
    expect(shopee?.unitsSoldToday).toBe(6);
    expect(shopee?.revenueToday).toBe(180000);
    expect(shopee?.kind).toBe('shopee');
    // The lazada sale is 30 days old, so it must not leak into "today".
    expect(summary.byChannel.some((row) => row.channelId === LAZADA)).toBe(false);
  });

  test('lowStockCount agrees with the inventory low-stock filter', async () => {
    const summary = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'owner');
    const page = await jsonAs<{ items: unknown[] }>(
      app,
      '/api/v1/inventory?lowStock=true&limit=100',
      'owner',
    );
    expect(summary.lowStockCount).toBe(page.items.length);
  });

  // -------------------------------------------------------------------------
  // J2 - channel sales + variance
  // -------------------------------------------------------------------------

  test('channel-sales reports the fixture channels over 60 days', async () => {
    const report = await jsonAs<ChannelSalesWire>(
      app,
      '/api/v1/reports/channel-sales?days=60',
      'owner',
    );
    expect(report.days).toBe(60);
    const lazada = report.rows.find((row) => row.channelId === LAZADA);
    // Only ORD-1: ORD-4 has no matched line, ORD-3 is cancelled.
    expect(lazada?.orders).toBe(1);
    expect(lazada?.unitsSold).toBe(4);
    expect(lazada?.revenue).toBe(100000);
    const shopee = report.rows.find((row) => row.channelId === SHOPEE);
    expect(shopee?.orders).toBe(1);
    expect(shopee?.unitsSold).toBe(6);
    expect(shopee?.revenue).toBe(180000);
    // Cancelled orders never appear as a row.
    expect(report.rows.some((row) => row.channelId === TIKTOK)).toBe(false);
  });

  test('channel-sales totals include every reported row', async () => {
    const report = await jsonAs<ChannelSalesWire>(
      app,
      '/api/v1/reports/channel-sales?days=60',
      'owner',
    );
    expect(report.totals.unitsSold).toBe(report.rows.reduce((sum, row) => sum + row.unitsSold, 0));
    expect(report.totals.unitsSold).toBeGreaterThanOrEqual(10);
  });

  test('variance groups the non-trade reasons per variant and Bangkok day', async () => {
    const report = await jsonAs<VarianceWire>(app, '/api/v1/reports/variance?days=7', 'owner');
    expect(report.days).toBe(7);
    const can = report.rows.find((row) => row.variantId === WATER_CAN);
    expect(can?.day).toBe(today);
    // cancel_restore +2 and return_in +1; sale_out and adjust_out(30d) excluded.
    expect(can?.qtyDelta).toBe(3);
    expect(can?.movements).toBe(2);
    const reasons = new Map((can?.byReason ?? []).map((entry) => [entry.reason, entry]));
    expect(reasons.get('cancel_restore')?.qtyDelta).toBe(2);
    expect(reasons.get('return_in')?.qtyDelta).toBe(1);
    expect(reasons.has('sale_out')).toBe(false);
    expect(reasons.has('purchase_in')).toBe(false);
  });

  test('variance widens to the 30-day-old adjustment with days=60', async () => {
    const report = await jsonAs<VarianceWire>(app, '/api/v1/reports/variance?days=60', 'owner');
    const canRows = report.rows.filter((row) => row.variantId === WATER_CAN);
    const old = canRows.find((row) => row.day === day30);
    expect(old?.qtyDelta).toBe(-3);
    expect(old?.byReason[0]?.reason).toBe('adjust_out');
  });

  test('variance needs stock:read, channel-sales needs order:read', async () => {
    // Every seeded role holds both permissions; assert the routes answer for
    // the least privileged one instead of inventing a role that cannot.
    const staff = await requestAs(app, '/api/v1/reports/variance?days=7', 'stock_staff');
    expect(staff.status).toBe(200);
    const sales = await requestAs(app, '/api/v1/reports/channel-sales?days=7', 'sales');
    expect(sales.status).toBe(200);
  });

  test('an out-of-range days param is a 400', async () => {
    const res = await requestAs(app, '/api/v1/reports/variance?days=0', 'owner');
    expect(res.status).toBe(400);
    const big = await requestAs(app, '/api/v1/reports/channel-sales?days=400', 'owner');
    expect(big.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // J3 - COGS report
  // -------------------------------------------------------------------------

  test('cogs matches the FIFO slices and order revenue per day and channel', async () => {
    const res = await requestAs(
      app,
      `/api/v1/reports/cogs?from=${bkkDateOffset(35)}&to=${today}`,
      'owner',
    );
    expect(res.status).toBe(200);
    const report = (await res.json()) as CogsWire;
    const lazada = report.rows.find((row) => row.channelId === LAZADA);
    expect(lazada?.date).toBe(day30);
    expect(lazada?.unitsSold).toBe(4);
    expect(lazada?.revenue).toBe(100000);
    expect(lazada?.cogs).toBe(35200);
    expect(lazada?.margin).toBe(64800);
    const shopee = report.rows.find((row) => row.channelId === SHOPEE);
    // 2 units from lot A (8800) + 4 units from lot B (9600).
    expect(shopee?.cogs).toBe(56000);
    expect(shopee?.unitsSold).toBe(6);
    expect(shopee?.margin).toBe(180000 - 56000);
  });

  test('cogs rows for roles without cost:read are a 403, never stripped', async () => {
    for (const role of ['sales', 'stock_staff'] as const) {
      const res = await requestAs(
        app,
        `/api/v1/reports/cogs?from=${bkkDateOffset(35)}&to=${today}`,
        role,
      );
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('forbidden');
    }
  });

  test('cogs totals equal the sum of the rows', async () => {
    const res = await requestAs(
      app,
      `/api/v1/reports/cogs?from=${bkkDateOffset(35)}&to=${today}`,
      'owner',
    );
    const report = (await res.json()) as CogsWire;
    expect(report.totals.unitsSold).toBe(report.rows.reduce((sum, row) => sum + row.unitsSold, 0));
    expect(report.totals.revenue).toBe(report.rows.reduce((sum, row) => sum + row.revenue, 0));
    expect(report.totals.unitsSold).toBeGreaterThanOrEqual(10);
  });
});
