/**
 * Drizzle `relations()` for the relational query API (`db.query.*.findMany`).
 *
 * They live in one file on purpose. Relations are declared in pairs, so putting
 * them next to their tables would force schema files to import each other in
 * both directions. One file = no cycles, and one place to look when a nested
 * `with: { ... }` does not compile.
 *
 * Reminder: relations are a TypeScript-only construct. They never create a
 * foreign key. The real constraints live on the column definitions.
 */

import { relations } from 'drizzle-orm';
import { bundleComponents, products, variants } from './catalog';
import { channelListings, channels } from './channels';
import { importBatches } from './imports';
import { movementLotConsumptions, stockLots, stockMovements, warehouses } from './inventory';
import { orderLines, orders } from './orders';
import { organizations, users } from './org';

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  products: many(products),
  channels: many(channels),
  warehouses: many(warehouses),
  orders: many(orders),
  importBatches: many(importBatches),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [products.orgId],
    references: [organizations.id],
  }),
  variants: many(variants),
}));

export const variantsRelations = relations(variants, ({ one, many }) => ({
  product: one(products, {
    fields: [variants.productId],
    references: [products.id],
  }),
  /** Recipe rows when this variant is a bundle. */
  components: many(bundleComponents, { relationName: 'bundleToComponents' }),
  /** Recipe rows where this variant is used inside some other bundle. */
  usedInBundles: many(bundleComponents, { relationName: 'componentToBundles' }),
  lots: many(stockLots),
  movements: many(stockMovements),
  listings: many(channelListings),
  orderLines: many(orderLines),
}));

export const bundleComponentsRelations = relations(bundleComponents, ({ one }) => ({
  bundleVariant: one(variants, {
    fields: [bundleComponents.bundleVariantId],
    references: [variants.id],
    relationName: 'bundleToComponents',
  }),
  componentVariant: one(variants, {
    fields: [bundleComponents.componentVariantId],
    references: [variants.id],
    relationName: 'componentToBundles',
  }),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [channels.orgId],
    references: [organizations.id],
  }),
  listings: many(channelListings),
  orders: many(orders),
  importBatches: many(importBatches),
}));

export const channelListingsRelations = relations(channelListings, ({ one }) => ({
  channel: one(channels, {
    fields: [channelListings.channelId],
    references: [channels.id],
  }),
  variant: one(variants, {
    fields: [channelListings.variantId],
    references: [variants.id],
  }),
}));

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [warehouses.orgId],
    references: [organizations.id],
  }),
  lots: many(stockLots),
  movements: many(stockMovements),
}));

export const stockLotsRelations = relations(stockLots, ({ one, many }) => ({
  variant: one(variants, {
    fields: [stockLots.variantId],
    references: [variants.id],
  }),
  warehouse: one(warehouses, {
    fields: [stockLots.warehouseId],
    references: [warehouses.id],
  }),
  sourceMovement: one(stockMovements, {
    fields: [stockLots.sourceMovementId],
    references: [stockMovements.id],
  }),
  consumptions: many(movementLotConsumptions),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one, many }) => ({
  variant: one(variants, {
    fields: [stockMovements.variantId],
    references: [variants.id],
  }),
  warehouse: one(warehouses, {
    fields: [stockMovements.warehouseId],
    references: [warehouses.id],
  }),
  channel: one(channels, {
    fields: [stockMovements.channelId],
    references: [channels.id],
  }),
  order: one(orders, {
    fields: [stockMovements.orderId],
    references: [orders.id],
  }),
  createdByUser: one(users, {
    fields: [stockMovements.createdBy],
    references: [users.id],
  }),
  /** The FIFO breakdown of this movement. */
  consumptions: many(movementLotConsumptions),
}));

export const movementLotConsumptionsRelations = relations(movementLotConsumptions, ({ one }) => ({
  movement: one(stockMovements, {
    fields: [movementLotConsumptions.movementId],
    references: [stockMovements.id],
  }),
  lot: one(stockLots, {
    fields: [movementLotConsumptions.lotId],
    references: [stockLots.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [orders.orgId],
    references: [organizations.id],
  }),
  channel: one(channels, {
    fields: [orders.channelId],
    references: [channels.id],
  }),
  importBatch: one(importBatches, {
    fields: [orders.importBatchId],
    references: [importBatches.id],
  }),
  lines: many(orderLines),
  movements: many(stockMovements),
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, {
    fields: [orderLines.orderId],
    references: [orders.id],
  }),
  variant: one(variants, {
    fields: [orderLines.variantId],
    references: [variants.id],
  }),
}));

export const importBatchesRelations = relations(importBatches, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [importBatches.orgId],
    references: [organizations.id],
  }),
  channel: one(channels, {
    fields: [importBatches.channelId],
    references: [channels.id],
  }),
  uploadedByUser: one(users, {
    fields: [importBatches.uploadedBy],
    references: [users.id],
  }),
  orders: many(orders),
}));
