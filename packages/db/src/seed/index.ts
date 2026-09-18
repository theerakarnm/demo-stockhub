/**
 * Seed runner: `bun run db:seed` (from the repo root).
 *
 * It is idempotent by brute force - TRUNCATE every business table, then insert
 * the fixed demo data from ./data.ts. Because every seed id is a literal, a
 * second run rebuilds exactly the same database.
 *
 * Safety: TRUNCATE is destructive, so the script refuses to run against a host
 * that is not local unless you set SEED_FORCE=1. Losing a demo database is
 * annoying; losing a customer database ends the deal.
 *
 * Prerequisite: the schema must exist. Run `bun run db:migrate` first.
 */

import { sql } from 'drizzle-orm';
import { createDbFromClient, createPostgresClient, requireDatabaseUrl } from '../client';
import {
  bundleComponents,
  channelListings,
  channels,
  customers,
  importBatches,
  orderLines,
  orders,
  organizations,
  priceTierPrices,
  priceTiers,
  products,
  stockLots,
  stockMovements,
  users,
  variants,
  warehouses,
} from '../schema';
import {
  SEED_BUNDLE_COMPONENTS,
  SEED_CHANNELS,
  SEED_CHANNEL_LISTINGS,
  SEED_CUSTOMERS,
  SEED_IDS,
  SEED_IMPORT_BATCHES,
  SEED_OPENING_STOCK,
  SEED_ORDERS,
  SEED_ORDER_LINES,
  SEED_ORG,
  SEED_PRICE_TIER_PRICES,
  SEED_PRICE_TIERS,
  SEED_PRODUCTS,
  SEED_USERS,
  SEED_VARIANTS,
  SEED_WAREHOUSES,
} from './data';

/** Child tables first is not needed with CASCADE, but the list documents the graph. */
const TABLES_TO_CLEAR = [
  'movement_lot_consumptions',
  'stock_lots',
  'stock_movements',
  'order_lines',
  'orders',
  'import_batches',
  'channel_listings',
  'bundle_components',
  'price_tier_prices',
  'customers',
  'price_tiers',
  'variants',
  'products',
  'channels',
  'warehouses',
  'users',
  'organizations',
] as const;

const assertLocalDatabase = (url: string): void => {
  const host = new URL(url).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === 'postgres';
  if (!isLocal && process.env.SEED_FORCE !== '1') {
    throw new Error(
      `Refusing to truncate a non-local database (${host}). Set SEED_FORCE=1 if you really mean it.`,
    );
  }
};

const main = async (): Promise<void> => {
  const url = requireDatabaseUrl();
  assertLocalDatabase(url);

  const client = createPostgresClient(url);
  const db = createDbFromClient(client);

  try {
    await db.transaction(async (tx) => {
      // RESTART IDENTITY is harmless here (no serial columns) but keeps the
      // statement correct if somebody adds one later.
      await tx.execute(
        sql.raw(`TRUNCATE TABLE ${TABLES_TO_CLEAR.join(', ')} RESTART IDENTITY CASCADE`),
      );

      await tx.insert(organizations).values(SEED_ORG);
      await tx.insert(users).values(SEED_USERS);
      await tx.insert(warehouses).values(SEED_WAREHOUSES);
      await tx.insert(channels).values(SEED_CHANNELS);
      await tx.insert(products).values(SEED_PRODUCTS);
      await tx.insert(variants).values(SEED_VARIANTS);
      await tx.insert(priceTiers).values(SEED_PRICE_TIERS);
      await tx.insert(priceTierPrices).values(SEED_PRICE_TIER_PRICES);
      await tx.insert(customers).values(SEED_CUSTOMERS);
      await tx.insert(bundleComponents).values(SEED_BUNDLE_COMPONENTS);

      // Opening stock: the purchase_in movement is the event, the lot is the
      // FIFO layer it opened. Insert the movement first so the lot can point at
      // it through source_movement_id.
      await tx.insert(stockMovements).values(
        SEED_OPENING_STOCK.map((entry) => ({
          id: entry.movementId,
          orgId: SEED_IDS.org,
          variantId: entry.variantId,
          warehouseId: SEED_IDS.warehouse,
          reason: 'purchase_in' as const,
          qtyDelta: entry.qty,
          costTotal: entry.qty * entry.unitCost,
          occurredAt: entry.receivedAt,
          note: `รับสินค้าเข้าคลัง ${entry.reference}`,
          createdBy: SEED_IDS.users.stock,
        })),
      );

      await tx.insert(stockLots).values(
        SEED_OPENING_STOCK.map((entry) => ({
          id: entry.lotId,
          orgId: SEED_IDS.org,
          variantId: entry.variantId,
          warehouseId: SEED_IDS.warehouse,
          qty: entry.qty,
          // Nothing has been sold in the seed, so the whole layer is still open.
          remainingQty: entry.qty,
          unitCost: entry.unitCost,
          receivedAt: entry.receivedAt,
          sourceMovementId: entry.movementId,
          reference: entry.reference,
        })),
      );

      await tx.insert(channelListings).values(SEED_CHANNEL_LISTINGS);
      await tx.insert(importBatches).values(SEED_IMPORT_BATCHES);
      await tx.insert(orders).values(SEED_ORDERS);
      await tx.insert(orderLines).values(SEED_ORDER_LINES);
    });

    const units = SEED_OPENING_STOCK.reduce((sum, entry) => sum + entry.qty, 0);
    const value = SEED_OPENING_STOCK.reduce((sum, entry) => sum + entry.qty * entry.unitCost, 0);

    console.info('Seed complete');
    console.info(`  org         ${SEED_ORG.name} (${SEED_IDS.org})`);
    console.info(`  users       ${SEED_USERS.length}`);
    console.info(`  channels    ${SEED_CHANNELS.length}`);
    console.info(`  products    ${SEED_PRODUCTS.length} / variants ${SEED_VARIANTS.length}`);
    console.info(`  lots        ${SEED_OPENING_STOCK.length} (${units} units)`);
    console.info(`  stock value ${(value / 100).toLocaleString('th-TH')} baht`);
    console.info(`  orders      ${SEED_ORDERS.length} (${SEED_ORDER_LINES.length} lines)`);
    console.info(
      `  tiers       ${SEED_PRICE_TIERS.length} (${SEED_PRICE_TIER_PRICES.length} tier prices)`,
    );
    console.info(`  customers   ${SEED_CUSTOMERS.length}`);
  } finally {
    await client.end();
  }
};

await main();
