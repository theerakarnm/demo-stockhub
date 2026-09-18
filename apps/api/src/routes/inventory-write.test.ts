/**
 * Inventory WRITE route tests (goods receipt + manual adjustment) against the
 * seeded database.
 *
 * Unlike inventory.test.ts these tests MUTATE the glove (GLV-01) stock, so the
 * afterAll hook deletes every row this suite created and restores the two seed
 * lots to 400 / 300 - the guards.integration.test.ts "seed invariant" check is
 * the proof that the restore is exact. Without DATABASE_URL the whole suite
 * skips, so `bun test` stays green with no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { SEED_IDS, createDb } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import { buildTestApp, requestAs } from '../test-utils';
import { inventoryRouter } from './inventory';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

/** Everything the cleanup removes must be newer than this point. */
const startedAt = new Date();

/** The Movement wire shape this suite asserts on (cost fields included). */
interface MovementWire {
  id: string;
  reason: string;
  qtyDelta: number;
  qtyAfter: number;
  unitCost?: number;
  totalCost?: number;
}

/** The error envelope from middleware/error.ts. */
interface ErrorWire {
  error: { code: string; details?: Record<string, unknown> };
}

/** Seed glove lots: 400 pairs at 28.00 and 300 pairs at 33.00 baht. */
const GLOVE_LOT_IDS = [
  '11000000-0000-4000-8000-000000000026',
  '11000000-0000-4000-8000-000000000027',
];

const post = (
  app: ReturnType<typeof buildTestApp>,
  path: string,
  role: 'owner' | 'manager' | 'stock_staff' | 'sales',
  body: unknown,
) =>
  requestAs(app, path, role, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe.skipIf(!url)('inventory write routes (seeded database)', () => {
  const app = buildTestApp((v1) => v1.route('/inventory', inventoryRouter));

  afterAll(async () => {
    if (!db) return;
    // Roll the glove stock back to the seed, children before parents so the
    // FKs never block: consumptions -> lots -> movements. The two seed lots
    // are not deleted, only their remaining_qty is reset, because the adjust
    // test consumed 2 pairs from the oldest one.
    await db.execute(sql`
      delete from movement_lot_consumptions
      where movement_id in (
        select id from stock_movements
        where variant_id = ${SEED_IDS.variants.glove} and created_at >= ${startedAt.toISOString()}
      )
    `);
    await db.execute(sql`
      delete from stock_lots
      where variant_id = ${SEED_IDS.variants.glove} and created_at >= ${startedAt.toISOString()}
    `);
    await db.execute(sql`
      delete from stock_movements
      where variant_id = ${SEED_IDS.variants.glove} and created_at >= ${startedAt.toISOString()}
    `);
    await db.execute(sql`
      update stock_lots set remaining_qty = qty
      where id in (${sql.join(
        GLOVE_LOT_IDS.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);
    await db.$client.end();
  });

  test('manager receives 5 pairs and gets the purchase_in movement back', async () => {
    const res = await post(app, '/api/v1/inventory/receive', 'manager', {
      variantId: SEED_IDS.variants.glove,
      qty: 5,
      unitCost: 3_300,
      reference: 'PO-TEST-001',
      note: 'รับถุงมือเข้าคลังจากใบสั่งซื้อทดสอบ',
    });
    expect(res.status).toBe(201);
    const movement = (await res.json()) as MovementWire;
    expect(movement.reason).toBe('purchase_in');
    expect(movement.qtyDelta).toBe(5);
    expect(movement.totalCost).toBe(16_500);
    expect(movement.qtyAfter).toBe(705);
  });

  test('stock_staff cannot receive: opening a cost layer needs cost:write', async () => {
    const res = await post(app, '/api/v1/inventory/receive', 'stock_staff', {
      variantId: SEED_IDS.variants.glove,
      qty: 5,
      unitCost: 3_300,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('forbidden');
    expect(body.error.details?.permission).toBe('cost:write');
  });

  test('sales cannot receive at all: no stock:adjust', async () => {
    const res = await post(app, '/api/v1/inventory/receive', 'sales', {
      variantId: SEED_IDS.variants.glove,
      qty: 5,
      unitCost: 3_300,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('forbidden');
    expect(body.error.details?.permission).toBe('stock:adjust');
  });

  test('adjust -2 consumes the oldest FIFO lot at 28.00 baht', async () => {
    const res = await post(app, '/api/v1/inventory/adjust', 'manager', {
      variantId: SEED_IDS.variants.glove,
      qtyDelta: -2,
      note: 'นับสต็อกขาด 2 คู่',
    });
    expect(res.status).toBe(201);
    const movement = (await res.json()) as MovementWire;
    expect(movement.reason).toBe('adjust_out');
    expect(movement.qtyDelta).toBe(-2);
    // 2 x 2_800 satang from the 2026-01-10 lot, never the newer 3_300 layer.
    expect(movement.totalCost).toBe(5_600);
  });

  test('inbound adjustment without unitCost is rejected', async () => {
    const res = await post(app, '/api/v1/inventory/adjust', 'manager', {
      variantId: SEED_IDS.variants.glove,
      qtyDelta: 3,
      note: 'นับสต็อกเกิน 3 คู่',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('validation_error');
  });

  test('adjustment beyond on-hand stock is a conflict, not a shortfall', async () => {
    const res = await post(app, '/api/v1/inventory/adjust', 'manager', {
      variantId: SEED_IDS.variants.glove,
      qtyDelta: -99_999,
      note: 'ปรับลดเกินสต็อกเพื่อทดสอบ',
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('insufficient_stock');
  });

  test('a zero-delta adjustment is not a movement', async () => {
    const res = await post(app, '/api/v1/inventory/adjust', 'manager', {
      variantId: SEED_IDS.variants.glove,
      qtyDelta: 0,
      note: 'ไม่มีการเปลี่ยนแปลง',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('validation_error');
  });
});
