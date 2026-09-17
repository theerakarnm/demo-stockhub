/**
 * The heart of the system: warehouses, FIFO lots, movements, and the lot-level
 * audit trail that makes a cost number explainable.
 *
 * Reading order:
 *   warehouses               where stock physically sits
 *   stock_movements          the ledger. Append only. Never UPDATE a row here.
 *   stock_lots               one purchase layer, with remaining qty and unit cost
 *   movement_lot_consumptions which lots an outbound movement ate, and at what cost
 *
 * The invariant that keeps the whole thing honest:
 *   on_hand(variant, warehouse) == SUM(stock_movements.qty_delta)
 *                               == SUM(stock_lots.remaining_qty)
 * A nightly check that compares the two is cheap and catches any bug in the
 * applier. Write it before the first customer goes live.
 *
 * Concurrency rule: a FIFO consume MUST run inside a transaction that first
 * locks the candidate lots with SELECT ... FOR UPDATE. Two parallel imports of
 * the same SKU otherwise read the same remaining_qty and both deduct it.
 */

import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps, tsColumn } from './_shared';
import { variants } from './catalog';
import { channels } from './channels';
import { movementReasonEnum } from './enums';
import { orders } from './orders';
import { orgIdColumn, users } from './org';

export const warehouses = pgTable(
  'warehouses',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    /** 'คลังหลัก', 'หน้าร้าน', ... */
    name: text('name').notNull(),
    code: text('code'),
    /** Exactly one warehouse per org should be the default target of imports. */
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (table) => [index('warehouses_org_idx').on(table.orgId)],
);

/**
 * The ledger. One row per (variant, reason, event).
 *
 * qtyDelta is signed: positive for inbound, negative for outbound. Use
 * isInbound(reason) from @stockhub/core to decide the sign, and keep the two in
 * agreement - a positive delta with reason 'sale_out' is a bug.
 *
 * costTotal is the COGS for outbound rows and the lot value for inbound rows,
 * always positive, always in satang.
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'restrict' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    reason: movementReasonEnum('reason').notNull(),
    /** Signed. Positive adds stock, negative removes it. Never 0. */
    qtyDelta: integer('qty_delta').notNull(),
    /** Absolute cost value of this movement, in satang. */
    costTotal: money('cost_total').notNull().default(0),
    /** Which channel caused it, when there is one. */
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    /** Business time, not insert time. Back-dated imports depend on it. */
    occurredAt: tsColumn('occurred_at').notNull(),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('stock_movements_org_idx').on(table.orgId),
    // Movement history screen for one product, newest first.
    index('stock_movements_variant_occurred_idx').on(table.variantId, table.occurredAt),
    // Whole-shop activity feed and daily reports.
    index('stock_movements_org_occurred_idx').on(table.orgId, table.occurredAt),
    // 'what did this order move' - used by cancel and return handling.
    index('stock_movements_order_idx').on(table.orderId),
    index('stock_movements_warehouse_idx').on(table.warehouseId, table.variantId),
  ],
);

/**
 * One FIFO layer, created by an inbound movement.
 *
 * `qty` is what arrived and never changes. `remainingQty` is what is left and
 * is decremented by consumption, incremented by a return or a cancel. Keeping
 * both means you can still show 'lot 3: 12 of 50 left' in the UI.
 */
export const stockLots = pgTable(
  'stock_lots',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'restrict' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    /** Units received into this layer. Immutable. */
    qty: integer('qty').notNull(),
    /** Units still available. 0 means the layer is closed. Never negative. */
    remainingQty: integer('remaining_qty').notNull(),
    /** Cost of ONE unit in this layer, in satang. Immutable once consumed. */
    unitCost: money('unit_cost').notNull(),
    /** FIFO order key. Ties are broken by id, matching core's consumeFifo. */
    receivedAt: tsColumn('received_at').notNull(),
    /**
     * The inbound movement that opened this layer.
     * No FK back-reference exists from stock_movements to stock_lots, which
     * keeps the two tables free of a circular dependency.
     */
    sourceMovementId: uuid('source_movement_id').references(() => stockMovements.id, {
      onDelete: 'set null',
    }),
    /** Supplier reference / PO number, shown next to the cost. */
    reference: text('reference'),
    ...timestamps,
  },
  (table) => [
    index('stock_lots_org_idx').on(table.orgId),
    // THE FIFO index: pick open layers of one variant in one warehouse, oldest
    // first. Add `.where(sql\`remaining_qty > 0\`)` as a partial index once the
    // table is big enough for it to matter.
    index('stock_lots_fifo_idx').on(table.variantId, table.warehouseId, table.receivedAt, table.id),
    index('stock_lots_remaining_idx').on(table.variantId, table.remainingQty),
  ],
);

/**
 * Which lots an outbound movement consumed, and at what cost.
 *
 * This is what lets the UI answer 'why is the COGS of this sale 1,240 baht'
 * with a breakdown instead of a shrug, and what `restoreFifo` reads to put the
 * exact cost back when the customer returns the goods.
 */
export const movementLotConsumptions = pgTable(
  'movement_lot_consumptions',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    movementId: uuid('movement_id')
      .notNull()
      .references(() => stockMovements.id, { onDelete: 'cascade' }),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => stockLots.id, { onDelete: 'restrict' }),
    /** Units taken from this lot by this movement. Positive. */
    qty: integer('qty').notNull(),
    /** Copied from the lot at consume time, so later edits cannot rewrite history. */
    unitCost: money('unit_cost').notNull(),
    /** qty * unitCost, rounded once at the slice level. */
    lineCost: money('line_cost').notNull(),
    ...timestamps,
  },
  (table) => [
    index('movement_lot_consumptions_movement_idx').on(table.movementId),
    index('movement_lot_consumptions_lot_idx').on(table.lotId),
    index('movement_lot_consumptions_org_idx').on(table.orgId),
  ],
);

export type Warehouse = typeof warehouses.$inferSelect;
export type NewWarehouse = typeof warehouses.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
export type StockLot = typeof stockLots.$inferSelect;
export type NewStockLot = typeof stockLots.$inferInsert;
export type MovementLotConsumption = typeof movementLotConsumptions.$inferSelect;
export type NewMovementLotConsumption = typeof movementLotConsumptions.$inferInsert;
