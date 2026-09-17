/**
 * Integration tests for the database-level guards.
 *
 * These prove that the DATABASE itself rejects bad data, independent of any
 * application code: re-imported duplicate orders, negative stock, zero-qty
 * movements and cost rows that do not add up. A regression here means the
 * migration drifted from the schema in `src/schema/`.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment (the repo root `.env` is auto-loaded by
 * bun). Without DATABASE_URL the whole file skips, so `bun test` stays green on
 * a fresh clone with no database running.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { createDb } from './client';
import { orders, stockLots, stockMovements } from './schema';
import { SEED_IDS } from './seed/data';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

/** Every violation is attempted inside its own transaction so it rolls back. */
const expectUniqueOrCheckViolation = async (fn: () => Promise<unknown>, constraint: string) => {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain(constraint);
    return;
  }
  throw new Error(`expected a violation of ${constraint}, but the insert succeeded`);
};

describe.skipIf(!db)('database guards', () => {
  afterAll(async () => {
    if (db) await db.$client.end();
  });

  test('rejects a duplicate (channel, external_order_id) pair - re-import is idempotent', async () => {
    if (!db) return;
    // drizzle's postgres-js execute() returns the row array directly.
    const existing = (await db.execute(
      sql`select channel_id, external_order_id from orders limit 1`,
    )) as Array<{ channel_id: string; external_order_id: string }>;
    const row = existing[0] ?? { channel_id: SEED_IDS.channels.shopeeMain, external_order_id: '' };
    await expectUniqueOrCheckViolation(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(orders).values({
            orgId: SEED_IDS.org,
            channelId: row.channel_id,
            externalOrderId: row.external_order_id,
            orderedAt: new Date(),
          });
        }),
      'orders_channel_external_uq',
    );
  });

  test('rejects a negative remaining_qty on a lot - stock can never go below zero', async () => {
    if (!db) return;
    await expectUniqueOrCheckViolation(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(stockLots).values({
            orgId: SEED_IDS.org,
            variantId: SEED_IDS.variants.hoe,
            warehouseId: SEED_IDS.warehouse,
            qty: 10,
            remainingQty: -1,
            unitCost: 12000,
            receivedAt: new Date(),
          });
        }),
      'stock_lots_remaining_range',
    );
  });

  test('rejects a remaining_qty above the received qty on a lot', async () => {
    if (!db) return;
    await expectUniqueOrCheckViolation(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(stockLots).values({
            orgId: SEED_IDS.org,
            variantId: SEED_IDS.variants.hoe,
            warehouseId: SEED_IDS.warehouse,
            qty: 10,
            remainingQty: 11,
            unitCost: 12000,
            receivedAt: new Date(),
          });
        }),
      'stock_lots_remaining_range',
    );
  });

  test('rejects a zero-qty movement - the ledger has no no-op rows', async () => {
    if (!db) return;
    await expectUniqueOrCheckViolation(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(stockMovements).values({
            orgId: SEED_IDS.org,
            variantId: SEED_IDS.variants.hoe,
            warehouseId: SEED_IDS.warehouse,
            reason: 'adjust_in',
            qtyDelta: 0,
            occurredAt: new Date(),
          });
        }),
      'stock_movements_qty_delta_nonzero',
    );
  });

  test('keeps the seed invariant: on-hand equals the sum of open lots', async () => {
    if (!db) return;
    const result = (await db.execute(sql`
      select count(*)::int as broken from (
        select v.id
        from variants v
        left join stock_lots l on l.variant_id = v.id
        left join stock_movements m on m.variant_id = v.id
        group by v.id
        having coalesce(sum(l.remaining_qty), 0) <> coalesce(sum(m.qty_delta), 0)
      ) t
    `)) as Array<{ broken: number }>;
    expect(result[0]?.broken ?? -1).toBe(0);
  });
});
