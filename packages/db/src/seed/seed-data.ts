/**
 * The seed write itself, as a function instead of a script.
 *
 * Why this file exists: `./index.ts` is a CLI entry point. It has a top-level
 * `await main()`, it reads `process.env`, and it opens and closes its own
 * postgres client. None of that can run inside a Cloudflare Worker, so the
 * demo reset endpoint (`POST /api/v1/demo/reset`) could not reuse it.
 *
 * `seedDatabase` takes an executor and does nothing else: no env, no
 * connection lifecycle, no logging. The CLI keeps those responsibilities and
 * the Worker supplies its own transaction.
 *
 * It is destructive by design - TRUNCATE every business table, then insert the
 * fixed demo data. Every seed id is a literal, so a second run rebuilds exactly
 * the same database. The caller owns the guard rails: the CLI checks the host,
 * the route checks ENVIRONMENT.
 */

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
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
  SEED_PRICE_TIERS,
  SEED_PRICE_TIER_PRICES,
  SEED_PRODUCTS,
  SEED_USERS,
  SEED_VARIANTS,
  SEED_WAREHOUSES,
} from './data';

/** Child tables first is not needed with CASCADE, but the list documents the graph. */
export const TABLES_TO_CLEAR = [
  'movement_lot_consumptions',
  'stock_lots',
  'stock_movements',
  'order_lines',
  'orders',
  'import_batches',
  'channel_listings',
  'bundle_components',
  'customers',
  'price_tier_prices',
  'price_tiers',
  'variants',
  'products',
  'channels',
  'warehouses',
  'users',
  'organizations',
] as const;

/** What the caller can report without counting the rows again. */
export interface SeedSummary {
  channels: number;
  products: number;
  variants: number;
  lots: number;
  /** Units across every opening lot. */
  units: number;
  /** Opening stock value in satang. */
  stockValue: number;
  orders: number;
  orderLines: number;
}

export const SEED_SUMMARY: SeedSummary = {
  channels: SEED_CHANNELS.length,
  products: SEED_PRODUCTS.length,
  variants: SEED_VARIANTS.length,
  lots: SEED_OPENING_STOCK.length,
  units: SEED_OPENING_STOCK.reduce((sum, entry) => sum + entry.qty, 0),
  stockValue: SEED_OPENING_STOCK.reduce((sum, entry) => sum + entry.qty * entry.unitCost, 0),
  orders: SEED_ORDERS.length,
  orderLines: SEED_ORDER_LINES.length,
};

/**
 * Wipe the business tables and write the demo data back.
 *
 * The caller MUST wrap this in a transaction. It is not done here because the
 * two callers own different transaction scopes: the CLI opens one around the
 * whole run, the route joins the request transaction.
 */
export const seedDatabase = async (tx: DbExecutor): Promise<SeedSummary> => {
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

  // Opening stock: the purchase_in movement is the event, the lot is the FIFO
  // layer it opened. Insert the movement first so the lot can point at it
  // through source_movement_id.
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

  return SEED_SUMMARY;
};
