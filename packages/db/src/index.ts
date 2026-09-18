/**
 * @stockhub/db - PostgreSQL data layer (Drizzle ORM + postgres.js).
 *
 *   import { createDb, schema, inventoryRepo, type Variant } from '@stockhub/db';
 *
 * Layering rule: this package may import @stockhub/core, never the other way
 * round, and never an app. Business decisions belong in core, SQL belongs here.
 */

export * from './client';
export * from './repositories';

/** Seeded demo identity. Data only, no side effects, safe to import from apps. */
export { SEED_IDS } from './seed/data';

/** Tables, enums and relations, namespaced to keep the top level readable. */
export * as schema from './schema';

/** Row types, exported flat because call sites annotate with them constantly. */
export type {
  BundleComponent,
  Channel,
  ChannelListing,
  Customer,
  ImportBatch,
  MovementLotConsumption,
  NewBundleComponent,
  NewChannel,
  NewChannelListing,
  NewCustomer,
  NewImportBatch,
  NewMovementLotConsumption,
  NewOrder,
  NewOrderLine,
  NewOrganization,
  NewPriceTier,
  NewPriceTierPrice,
  NewProduct,
  NewStockLot,
  NewStockMovement,
  NewUser,
  NewVariant,
  NewWarehouse,
  Order,
  OrderLine,
  Organization,
  PriceTier,
  PriceTierPrice,
  Product,
  StockLot,
  StockMovement,
  User,
  Variant,
  Warehouse,
} from './schema';
