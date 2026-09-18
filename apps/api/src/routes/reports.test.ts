/**
 * Dashboard route tests against the seeded database.
 *
 * The suite MUTATES the ledger, so the fixtures land inside one transaction
 * and the afterAll hook deletes exactly the rows this file created, by fixed
 * id, and restores the touched seed lots to remaining_qty = qty. The "seed
 * invariant" check in packages/db/guards.integration.test.ts is the proof the
 * restore is exact. Test data touches only the water-can variant and its own
 * orders, so the parallel suites that assert seed absolutes (inventory count,
 * purchase_in count) stay valid while this file runs.
 *
 * Without DATABASE_URL the whole suite skips, so `bun test` stays green with
 * no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { SEED_IDS, createDb } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import { buildTestApp, jsonAs } from '../test-utils';
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

describe.skipIf(!url)('dashboard summary (seeded database)', () => {
  const app = buildTestApp((v1) =>
    v1
      .route('/dashboard', dashboardRouter)
      // Mounted only for the low-stock consistency check against the summary.
      .route('/inventory', inventoryRouter),
  );

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);

  /** Summary taken before the fixture lands, for delta assertions. */
  let before: SummaryWire;

  test('setup: ledger fixtures land in one transaction', async () => {
    if (!db) return;
    before = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'owner');

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into orders (id, org_id, channel_id, external_order_id, status, ordered_at, grand_total, buyer_name)
        values
          ('1a000000-0000-4000-8000-000000000001', ${ORG}, ${LAZADA}, 'JTEST-ORD-1', 'shipped', ${d30.toISOString()}::timestamptz, 100000, 'ลูกค้าทดสอบ 1'),
          ('1a000000-0000-4000-8000-000000000002', ${ORG}, ${SHOPEE}, 'JTEST-ORD-2', 'shipped', ${now.toISOString()}::timestamptz, 180000, 'ลูกค้าทดสอบ 2')
      `);
      await tx.execute(sql`
        insert into order_lines (id, org_id, order_id, variant_id, platform_sku, platform_product_name, qty, unit_price, discount, match_source)
        values
          ('1b000000-0000-4000-8000-000000000001', ${ORG}, '1a000000-0000-4000-8000-000000000001', ${WATER_CAN}, 'JTEST-CAN', 'บัวรดน้ำทดสอบ', 4, 25000, 0, 'sku_exact'),
          ('1b000000-0000-4000-8000-000000000002', ${ORG}, '1a000000-0000-4000-8000-000000000002', ${WATER_CAN}, 'JTEST-CAN', 'บัวรดน้ำทดสอบ', 6, 30000, 0, 'sku_exact')
      `);
      // Ledger. Lot deltas keep the seed invariant true at every instant:
      // sum(qty_delta) = -10 and the lots drop by exactly 10 units.
      await tx.execute(sql`
        insert into stock_movements (id, org_id, variant_id, warehouse_id, reason, qty_delta, cost_total, channel_id, order_id, occurred_at, note)
        values
          ('1c000000-0000-4000-8000-000000000001', ${ORG}, ${WATER_CAN}, ${WAREHOUSE}, 'sale_out', -4, 35200, ${LAZADA}, '1a000000-0000-4000-8000-000000000001', ${d30.toISOString()}::timestamptz, 'ขายทดสอบ 30 วันก่อน'),
          ('1c000000-0000-4000-8000-000000000003', ${ORG}, ${WATER_CAN}, ${WAREHOUSE}, 'sale_out', -6, 56000, ${SHOPEE}, '1a000000-0000-4000-8000-000000000002', ${now.toISOString()}::timestamptz, 'ขายทดสอบวันนี้')
      `);
      // FIFO slices of the two sales.
      await tx.execute(sql`
        insert into movement_lot_consumptions (id, org_id, movement_id, lot_id, qty, unit_cost, line_cost)
        values
          ('1d000000-0000-4000-8000-000000000001', ${ORG}, '1c000000-0000-4000-8000-000000000001', ${CAN_LOT_A}, 4, 8800, 35200),
          ('1d000000-0000-4000-8000-000000000002', ${ORG}, '1c000000-0000-4000-8000-000000000003', ${CAN_LOT_A}, 2, 8800, 17600),
          ('1d000000-0000-4000-8000-000000000003', ${ORG}, '1c000000-0000-4000-8000-000000000003', ${CAN_LOT_B}, 4, 9600, 38400)
      `);
      await tx.execute(
        sql`update stock_lots set remaining_qty = remaining_qty - 6 where id = ${CAN_LOT_A}`,
      );
      await tx.execute(
        sql`update stock_lots set remaining_qty = remaining_qty - 4 where id = ${CAN_LOT_B}`,
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    // Delete by the fixture's own fixed ids, never by created_at: a concurrent
    // suite writing real rows must never be swept up by this cleanup.
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        delete from movement_lot_consumptions where movement_id in (
          '1c000000-0000-4000-8000-000000000001', '1c000000-0000-4000-8000-000000000003'
        )
      `);
      await tx.execute(sql`
        delete from stock_movements where id in (
          '1c000000-0000-4000-8000-000000000001', '1c000000-0000-4000-8000-000000000003'
        )
      `);
      await tx.execute(sql`
        delete from order_lines where order_id in (
          '1a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000002'
        )
      `);
      await tx.execute(sql`
        delete from orders where id in (
          '1a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000002'
        )
      `);
      // The seed layers must end exactly where they started.
      await tx.execute(
        sql`update stock_lots set remaining_qty = qty where id in (${CAN_LOT_A}, ${CAN_LOT_B})`,
      );
    });
    await db.$client.end();
  });

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
    // on-hand moved by the net -10 of the two fixture sales.
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
    // 6 units, 180000 satang revenue from ORD-2.
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
});
