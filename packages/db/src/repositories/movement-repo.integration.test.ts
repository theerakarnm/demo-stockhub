/**
 * Integration tests for the per-order profit read model.
 *
 * They need a live Postgres with the migration applied and the seed loaded:
 *
 *   bun run docker:up && bun run db:migrate && bun run db:seed
 *
 * and DATABASE_URL in the environment. Without DATABASE_URL the whole file
 * skips. Every test runs inside one transaction that is rolled back by
 * throwing a sentinel, so the seed stays byte-for-byte identical.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { asChannelId, asOrgId } from '@stockhub/core';
import type { DbTransaction } from '../client';
import { createDb } from '../client';
import { orders, stockMovements } from '../schema';
import { SEED_IDS } from '../seed/data';
import { listProfitOrders } from './movement-repo';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

class Rollback extends Error {}

/** Run the body in a transaction, then undo everything it touched. */
const inRollback = async (fn: (tx: DbTransaction) => Promise<void>): Promise<void> => {
  if (!db) return;
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
};

describe.skipIf(!db)('movement repo: profit read model', () => {
  afterAll(async () => {
    if (db) await db.$client.end();
  });

  const orgId = asOrgId(SEED_IDS.org);
  const shopeeMain = asChannelId(SEED_IDS.channels.shopeeMain);
  const pos = asChannelId(SEED_IDS.channels.pos);
  // Fixed so the movement rows can reference the order without reading it back.
  const profitOrderId = '16000000-0000-4000-8000-000000000001';
  const plainOrderId = '16000000-0000-4000-8000-000000000002';

  /** One delivered Shopee order plus the sale_out / return_in rows it wrote. */
  const insertShippedOrder = async (tx: DbTransaction): Promise<void> => {
    const now = new Date();
    await tx.insert(orders).values({
      id: profitOrderId,
      orgId,
      channelId: shopeeMain,
      externalOrderId: 'PROFIT-TEST-0001',
      status: 'delivered',
      orderedAt: now,
      grandTotal: 50500,
      platformFee: 7070,
      feeSource: 'channel_default',
    });
    await tx.insert(stockMovements).values([
      {
        orgId,
        variantId: SEED_IDS.variants.hoe,
        warehouseId: SEED_IDS.warehouse,
        reason: 'sale_out',
        // Outbound: the ledger stores the sign, so selling 3 units is -3.
        qtyDelta: -3,
        costTotal: 24000,
        channelId: SEED_IDS.channels.shopeeMain,
        orderId: profitOrderId,
        occurredAt: now,
      },
      {
        orgId,
        variantId: SEED_IDS.variants.hoe,
        warehouseId: SEED_IDS.warehouse,
        reason: 'return_in',
        // Restores are INBOUND: positive delta, positive cost.
        qtyDelta: 1,
        costTotal: 8000,
        channelId: SEED_IDS.channels.shopeeMain,
        orderId: profitOrderId,
        occurredAt: now,
      },
    ]);
  };

  const windowAroundNow = () => ({
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000),
  });

  test('sums sale_out and restore movements with the ledger signs', async () => {
    if (!db) return;
    await inRollback(async (tx) => {
      await insertShippedOrder(tx);
      const rows = await listProfitOrders(tx, { orgId, ...windowAroundNow() });
      const row = rows.find((r) => r.orderId === profitOrderId);
      expect(row).toBeDefined();
      expect(row?.unitsSold).toBe(3); // -(-3), not -3
      expect(row?.soldCost).toBe(24000);
      expect(row?.restoredUnits).toBe(1); // inbound, so no minus
      expect(row?.restoredCost).toBe(8000);
      expect(row?.grandTotal).toBe(50500);
      expect(row?.platformFee).toBe(7070);
      expect(row?.feeSource).toBe('channel_default');
      expect(row?.status).toBe('delivered');
      expect(row?.channelKind).toBe('shopee');
    });
  });

  test('an order without sale_out movements does not appear', async () => {
    if (!db) return;
    await inRollback(async (tx) => {
      await insertShippedOrder(tx);
      await tx.insert(orders).values({
        id: plainOrderId,
        orgId,
        channelId: shopeeMain,
        externalOrderId: 'PROFIT-TEST-0002',
        status: 'pending',
        orderedAt: new Date(),
        grandTotal: 10000,
      });
      const rows = await listProfitOrders(tx, { orgId, ...windowAroundNow() });
      expect(rows.some((r) => r.orderId === profitOrderId)).toBe(true);
      expect(rows.some((r) => r.orderId === plainOrderId)).toBe(false);
    });
  });

  test('the channelId filter drops rows from other channels', async () => {
    if (!db) return;
    await inRollback(async (tx) => {
      await insertShippedOrder(tx);
      const rows = await listProfitOrders(tx, { orgId, ...windowAroundNow(), channelId: pos });
      expect(rows.some((r) => r.orderId === profitOrderId)).toBe(false);
    });
  });
});
