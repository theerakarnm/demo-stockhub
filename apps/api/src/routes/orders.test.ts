/**
 * Order route tests (POS bills, cancel, return) against the seeded database.
 *
 * These tests MUTATE stock (hoe, water-set components, gloves), so the
 * afterAll hook deletes every row created after the suite started, in FK
 * order, and restores the touched seed lots to remaining_qty = qty. The
 * guards.integration.test.ts "seed invariant" check is the proof that the
 * restore is exact. Without DATABASE_URL the whole suite skips, so
 * `bun test` stays green with no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { asOrgId } from '@stockhub/core';
import { SEED_IDS, createDb, movementRepo } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import { buildTestApp, jsonAs, requestAs } from '../test-utils';
import { inventoryRouter } from './inventory';
import { ordersRouter } from './orders';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

/** Everything the cleanup removes must be newer than this point. */
const startedAt = new Date();

/** Seed lots this suite can consume or restore, keyed by nothing - just ids. */
const HOE_LOT_IDS = [
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002',
];
const TOUCHED_LOT_IDS = [
  ...HOE_LOT_IDS,
  // hose, nozzle, connector (the water-set components)
  '11000000-0000-4000-8000-000000000013',
  '11000000-0000-4000-8000-000000000014',
  '11000000-0000-4000-8000-000000000015',
  '11000000-0000-4000-8000-000000000016',
  '11000000-0000-4000-8000-000000000017',
  '11000000-0000-4000-8000-000000000018',
  // gloves
  '11000000-0000-4000-8000-000000000026',
  '11000000-0000-4000-8000-000000000027',
];

/** The Order wire shape this suite asserts on (cost fields included). */
interface OrderWire {
  id: string;
  status: string;
  grandTotal: number;
  customerId?: string;
  customerName?: string;
  priceTierId?: string;
  cogs?: number;
  margin?: number;
  lines: {
    id: string;
    variantId: string;
    quantity: number;
    unitPrice?: number;
    totalCost?: number;
  }[];
}

/** The Movement wire shape this suite asserts on. */
interface MovementWire {
  id: string;
  reason: string;
  qtyDelta: number;
  totalCost?: number;
}

/** The error envelope from middleware/error.ts. */
interface ErrorWire {
  error: { code: string; details?: Record<string, unknown> };
}

interface DetailWire {
  onHand: number;
}

const post = (
  app: ReturnType<typeof buildTestApp>,
  path: string,
  role: 'owner' | 'manager' | 'sales',
  body: unknown,
) =>
  requestAs(app, path, role, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe.skipIf(!url)('order routes (seeded database)', () => {
  const app = buildTestApp((v1) =>
    v1.route('/orders', ordersRouter).route('/inventory', inventoryRouter),
  );

  let hoeBillId = '';
  let gloveBillId = '';
  let gloveLineId = '';

  afterAll(async () => {
    if (!db) return;
    // Roll back in FK order. Movements are deleted BEFORE the orders: deleting
    // an order only nulls movement.order_id (FK set null), so the ledger rows
    // are found by created_at instead of by order id. Consumptions cascade
    // from their movements, lines cascade from their orders.
    await db.execute(sql`
      delete from movement_lot_consumptions
      where movement_id in (
        select id from stock_movements where created_at >= ${startedAt.toISOString()}
      )
    `);
    await db.execute(sql`
      delete from stock_movements where created_at >= ${startedAt.toISOString()}
    `);
    await db.execute(sql`
      delete from orders where created_at >= ${startedAt.toISOString()}
    `);
    // Reset the seed FIFO layers this suite consumed and restored.
    await db.execute(sql`
      update stock_lots set remaining_qty = qty
      where id in (${sql.join(
        TOUCHED_LOT_IDS.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);
    await db.$client.end();
  });

  test('sales creates a POS bill for 2 hoes: shipped, 37000, cost stripped', async () => {
    const res = await post(app, '/api/v1/orders', 'sales', {
      channelKind: 'pos',
      customerName: 'ลูกค้าทดสอบหน้าร้าน',
      lines: [{ variantId: SEED_IDS.variants.hoe, quantity: 2 }],
    });
    expect(res.status).toBe(201);
    const bill = (await res.json()) as OrderWire;
    expect(bill.status).toBe('shipped');
    expect(bill.grandTotal).toBe(37_000);
    expect('cogs' in bill).toBe(false);
    expect('margin' in bill).toBe(false);
    const firstLine = bill.lines[0];
    expect(firstLine && 'totalCost' in firstLine).toBe(false);
    hoeBillId = bill.id;
  });

  test('manager reads the same bill with cogs 24000 and margin 13000', async () => {
    const res = await requestAs(app, `/api/v1/orders/${hoeBillId}`, 'manager');
    expect(res.status).toBe(200);
    const bill = (await res.json()) as OrderWire;
    // 2 units from the oldest lot at 120.00 baht each.
    expect(bill.cogs).toBe(24_000);
    expect(bill.margin).toBe(13_000);
    expect(bill.lines[0]?.totalCost).toBe(24_000);
  });

  test('the hoe on-hand drops from 100 to 98', async () => {
    const detail = await jsonAs<DetailWire>(
      app,
      `/api/v1/inventory/${SEED_IDS.variants.hoe}`,
      'owner',
    );
    expect(detail.onHand).toBe(98);
  });

  test('a water-set bundle bill consumes hose 1, nozzle 1, connector 2', async () => {
    const res = await post(app, '/api/v1/orders', 'manager', {
      channelKind: 'wholesale',
      lines: [{ variantId: SEED_IDS.variants.bundleWater, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    const bill = (await res.json()) as OrderWire;
    if (!db) return;
    // The wire has no movements?orderId read yet, so assert on the repository
    // seam the cancel / return flow uses.
    const movements = await movementRepo.listMovementsForOrder(db, {
      orgId: asOrgId(SEED_IDS.org),
      orderId: bill.id,
    });
    expect(movements).toHaveLength(3);
    expect(movements.every((movement) => movement.reason === 'sale_out')).toBe(true);
    const byVariant = new Map(movements.map((movement) => [movement.variantId, movement]));
    expect(byVariant.get(SEED_IDS.variants.hose)?.qtyDelta).toBe(-1);
    expect(byVariant.get(SEED_IDS.variants.nozzle)?.qtyDelta).toBe(-1);
    expect(byVariant.get(SEED_IDS.variants.conn)?.qtyDelta).toBe(-2);
  });

  test('selling 999 sprayers is refused with 409 insufficient_stock', async () => {
    const res = await post(app, '/api/v1/orders', 'sales', {
      channelKind: 'pos',
      lines: [{ variantId: SEED_IDS.variants.sprayer, quantity: 999 }],
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('insufficient_stock');
  });

  test('cancelling the hoe bill restores the exact 24000 slices and the stock', async () => {
    const res = await post(app, `/api/v1/orders/${hoeBillId}/cancel`, 'manager', {
      reason: 'ลูกค้ายกเลิกบิลทดสอบ',
    });
    expect(res.status).toBe(200);
    const movements = (await res.json()) as MovementWire[];
    expect(movements).toHaveLength(1);
    expect(movements[0]?.reason).toBe('cancel_restore');
    expect(movements[0]?.qtyDelta).toBe(2);
    expect(movements[0]?.totalCost).toBe(24_000);
    const detail = await jsonAs<DetailWire>(
      app,
      `/api/v1/inventory/${SEED_IDS.variants.hoe}`,
      'owner',
    );
    expect(detail.onHand).toBe(100);
    const bill = await jsonAs<OrderWire>(app, `/api/v1/orders/${hoeBillId}`, 'manager');
    expect(bill.status).toBe('cancelled');
  });

  test('cancelling the same bill twice is a 400, not a second restore', async () => {
    const res = await post(app, `/api/v1/orders/${hoeBillId}/cancel`, 'manager', {
      reason: 'ยกเลิกซ้ำอีกครั้งเพื่อทดสอบ',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('validation_error');
  });

  test('returning 2 of 3 gloves with restock writes one return_in of 2', async () => {
    const res = await post(app, '/api/v1/orders', 'sales', {
      channelKind: 'pos',
      lines: [{ variantId: SEED_IDS.variants.glove, quantity: 3 }],
    });
    expect(res.status).toBe(201);
    const bill = (await res.json()) as OrderWire;
    gloveBillId = bill.id;
    const lineId = bill.lines[0]?.id;
    expect(lineId).toBeTruthy();
    gloveLineId = lineId ?? '';
    const returned = await post(app, `/api/v1/orders/${gloveBillId}/return`, 'manager', {
      lines: [{ orderLineId: gloveLineId, quantity: 2, restock: true }],
    });
    expect(returned.status).toBe(200);
    const movements = (await returned.json()) as MovementWire[];
    const returnIn = movements.filter((movement) => movement.reason === 'return_in');
    expect(returnIn).toHaveLength(1);
    expect(returnIn[0]?.qtyDelta).toBe(2);
    // One unit is still out with the customer, so the bill is not returned yet.
    const stillOpen = await jsonAs<OrderWire>(app, `/api/v1/orders/${gloveBillId}`, 'manager');
    expect(stillOpen.status).toBe('shipped');
  });

  test('returning the last glove without restock adds adjust_out and returns the bill', async () => {
    const returned = await post(app, `/api/v1/orders/${gloveBillId}/return`, 'manager', {
      lines: [{ orderLineId: gloveLineId, quantity: 1, restock: false }],
    });
    expect(returned.status).toBe(200);
    const movements = (await returned.json()) as MovementWire[];
    const returnIn = movements.filter((movement) => movement.reason === 'return_in');
    const adjustOut = movements.filter((movement) => movement.reason === 'adjust_out');
    expect(returnIn).toHaveLength(1);
    expect(returnIn[0]?.qtyDelta).toBe(1);
    expect(adjustOut).toHaveLength(1);
    expect(adjustOut[0]?.qtyDelta).toBe(-1);
    const bill = await jsonAs<OrderWire>(app, `/api/v1/orders/${gloveBillId}`, 'manager');
    expect(bill.status).toBe('returned');
  });

  test('a dealer customer bill stores the tier price, the customer and the tier', async () => {
    const res = await post(app, '/api/v1/orders', 'sales', {
      channelKind: 'pos',
      customerId: SEED_IDS.customers.dealerNorth,
      lines: [{ variantId: SEED_IDS.variants.hoe, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    const bill = (await res.json()) as OrderWire;
    // HOE-001 sells at 185.00; the dealer tier is 185 * 0.82 rounded to 152.00.
    expect(bill.lines[0]?.unitPrice).toBe(15_200);
    expect(bill.grandTotal).toBe(15_200);
    expect(bill.customerName).toBe('ตัวแทนภาคเหนือ');
    // sales holds price_tier:read in the merged rbac, so its response keeps
    // the tier id; stock_staff is the role the tier is stripped from.
    expect(bill.priceTierId).toBe(SEED_IDS.priceTiers.dealer);
    // The same bill as owner carries the tier evidence too.
    const asOwner = await jsonAs<OrderWire>(app, `/api/v1/orders/${bill.id}`, 'owner');
    expect(asOwner.priceTierId).toBe(SEED_IDS.priceTiers.dealer);
    const asStockStaff = await jsonAs<OrderWire>(app, `/api/v1/orders/${bill.id}`, 'stock_staff');
    expect('priceTierId' in asStockStaff).toBe(false);
    // A customer id outside the org is a 404, not a 500.
    const missing = await post(app, '/api/v1/orders', 'sales', {
      channelKind: 'pos',
      customerId: '99999999-9999-9999-9999-999999999999',
      lines: [{ variantId: SEED_IDS.variants.hoe, quantity: 1 }],
    });
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as ErrorWire;
    expect(body.error.code).toBe('not_found');
  });
});
