/**
 * Orders: read the normalised order list, and create a POS / wholesale bill.
 *
 * A POS bill is the ONLY order this system creates itself. Marketplace orders
 * always come from an import, so the local number keeps matching the platform.
 *
 * The difference that matters for costing: a POS sale must refuse to oversell
 * (planMovements with shortagePolicy 'error'), while an imported marketplace
 * sale must accept a shortfall, because that sale already happened in the real
 * world.
 */

import {
  type BundleComponent,
  StockHubError,
  asChannelId,
  asCustomerId,
  asOrderId,
  asVariantId,
  asWarehouseId,
  expandBundles,
  mulMoney,
  planMovements,
  satang,
  stockEffectOf,
} from '@stockhub/core';
import type {
  LotConsumption,
  MovementRequestLine,
  OrderId,
  OrgId,
  Satang,
  StockLot,
  VariantId,
} from '@stockhub/core';
import type { ChannelKind } from '@stockhub/core';
import {
  type DbExecutor,
  type Order as DbOrder,
  type OrderLine as DbOrderLine,
  type NewOrderLine,
  catalogRepo,
  channelRepo,
  customerRepo,
  inventoryRepo,
  movementRepo,
  orderRepo,
} from '@stockhub/db';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import type { CreateOrderBody, ListOrdersQuery } from '../schemas/orders';
import type { Movement, Order, OrderLine, Page } from '../types/contract';
import type { ServiceContext } from './context';
import { toMovementView } from './inventory-service';
import { resolvePrices } from './pricing-service';

/** Display name shared by the list and the detail screen, as in inventory-service. */
const displayName = (productName: string, variantName: string | null): string =>
  variantName ? `${productName} (${variantName})` : productName;

/**
 * Upper bound of the in-memory keyset window. orderRepo.listOrders pages by
 * offset and cannot seek a cursor, so the service pulls one bounded window,
 * newest first, and slices strictly after the cursor sort key in memory. Demo
 * tenants hold a fraction of one window; a real deploy moves this keyset into
 * the repository query.
 */
const LIST_WINDOW = 200;

/** One order row with its lines, the read shape the wire mappers work on. */
interface OrderWithLines {
  order: DbOrder;
  lines: DbOrderLine[];
}

/** Fetch the lines of every order on a page: one small query per order id. */
const withLines = async (
  exec: DbExecutor,
  orgId: OrgId,
  rows: readonly DbOrder[],
): Promise<OrderWithLines[]> =>
  Promise.all(
    rows.map(async (order) => {
      const entry = await orderRepo.getOrderWithLines(exec, { orgId, orderId: order.id });
      return { order, lines: entry?.lines ?? [] };
    }),
  );

const toWireLine = (
  line: DbOrderLine,
  variantById: ReadonlyMap<VariantId, catalogRepo.VariantWithProduct>,
): OrderLine => {
  const variant =
    line.variantId === null ? undefined : variantById.get(asVariantId(line.variantId));
  return {
    id: line.id,
    variantId: line.variantId ?? '',
    sku: variant?.sku ?? line.platformSku,
    name: variant
      ? displayName(variant.productName, variant.name)
      : (line.platformProductName ?? line.platformSku),
    quantity: line.qty,
    unitPrice: line.unitPrice,
    discount: line.discount,
    // DB money arrives as a plain number; the arithmetic stays integer satang.
    lineTotal: satang(line.qty * line.unitPrice - line.discount),
  };
};

const toWireOrder = (
  order: DbOrder,
  lines: readonly OrderLine[],
  channelKind: ChannelKind,
  cost: { cogs?: Satang; margin?: Satang } = {},
): Order => ({
  id: order.id,
  externalOrderId: order.externalOrderId,
  channelId: order.channelId,
  channelKind,
  status: order.status,
  customerId: order.customerId ?? undefined,
  customerName: order.buyerName ?? undefined,
  // Tier evidence for the bill; stripped for roles without price_tier:read.
  priceTierId: order.priceTierId ?? undefined,
  grandTotal: order.grandTotal,
  orderedAt: order.orderedAt.toISOString(),
  lines: [...lines],
  ...(cost.cogs === undefined ? {} : { cogs: cost.cogs }),
  ...(cost.margin === undefined ? {} : { margin: cost.margin }),
});

/**
 * Map DB rows onto the wire contract. The channel kind and the variant
 * sku / name come from two small lookups shared by the whole page instead of
 * a join per row. Cost fields are appended by the callers that know them;
 * lib/response.ts strips them per role.
 */
const toWireOrders = async (
  exec: DbExecutor,
  orgId: OrgId,
  entries: readonly OrderWithLines[],
): Promise<Order[]> => {
  if (entries.length === 0) return [];
  const channels = await channelRepo.listChannels(exec, { orgId });
  const kindByChannel = new Map(channels.map((channel) => [channel.id, channel.kind]));
  const variantIdSet = new Set<string>();
  for (const { lines } of entries) {
    for (const line of lines) if (line.variantId) variantIdSet.add(line.variantId);
  }
  const variantById = await catalogRepo.getVariantsByIds(exec, {
    orgId,
    variantIds: [...variantIdSet].map(asVariantId),
  });
  return entries.flatMap(({ order, lines }) => {
    const kind = kindByChannel.get(order.channelId);
    // Unreachable while orders.channel_id restricts to a live channel row.
    if (!kind) return [];
    return [
      toWireOrder(
        order,
        lines.map((line) => toWireLine(line, variantById)),
        kind,
      ),
    ];
  });
};

/**
 * Page of orders, newest first.
 *
 * Lines are fetched per order id rather than one big join, so a 50 line
 * wholesale bill does not blow the page size out.
 */
export const listOrders = async (
  ctx: ServiceContext,
  query: ListOrdersQuery,
): Promise<Page<Order>> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const rows = await orderRepo.listOrders(exec, {
    orgId,
    channelId: query.channelId === undefined ? undefined : asChannelId(query.channelId),
    status: query.status,
    limit: LIST_WINDOW,
  });
  const cursorAt = cursor === undefined ? undefined : Date.parse(cursor.at);
  const inWindow =
    cursor === undefined || cursorAt === undefined
      ? rows
      : rows.filter(
          (row) =>
            row.orderedAt.getTime() < cursorAt ||
            (row.orderedAt.getTime() === cursorAt && row.id < cursor.id),
        );
  const page = inWindow.slice(0, query.limit);
  const lastRow = page.at(query.limit - 1);
  const nextCursor =
    inWindow.length > query.limit && lastRow
      ? encodeCursor({ at: lastRow.orderedAt.toISOString(), id: lastRow.id })
      : null;
  const items = await toWireOrders(exec, orgId, await withLines(exec, orgId, page));
  return { items, nextCursor };
};

/** The kind of one order's channel; the channel table is tiny, so no dedicated lookup. */
const channelKindOf = async (
  exec: DbExecutor,
  orgId: OrgId,
  channelId: string,
): Promise<ChannelKind> => {
  const channels = await channelRepo.listChannels(exec, { orgId });
  const kind = channels.find((channel) => channel.id === channelId)?.kind;
  if (!kind) {
    throw new StockHubError('not_found', `Channel ${channelId} not found`, { channelId });
  }
  return kind;
};

/**
 * The original sale cost of one line: its own movement's cost, or for a bundle
 * line the sum of its components' costs - the bundle itself never moved stock.
 */
const lineTotalCost = (
  line: DbOrderLine,
  saleCostByVariant: ReadonlyMap<VariantId, number>,
  componentsByBundle: ReadonlyMap<VariantId, readonly BundleComponent[]>,
): Satang | undefined => {
  if (line.variantId === null) return undefined;
  const variantId = asVariantId(line.variantId);
  const recipe = componentsByBundle.get(variantId);
  if (recipe === undefined || recipe.length === 0) {
    const cost = saleCostByVariant.get(variantId);
    return cost === undefined ? undefined : satang(cost);
  }
  return satang(
    recipe.reduce(
      (sum, component) => sum + (saleCostByVariant.get(component.componentVariantId) ?? 0),
      0,
    ),
  );
};

export const getOrder = async (ctx: ServiceContext, orderId: OrderId): Promise<Order> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  const entry = await orderRepo.getOrderWithLines(exec, { orgId, orderId });
  if (!entry) {
    throw new StockHubError('not_found', `Order ${orderId} not found`, { orderId });
  }
  // Reads carry the same cost numbers a create response does: the net ledger
  // cost of the order (sales out, minus what walked back in) plus the per-line
  // share of the original sale cost.
  const movements = await movementRepo.listMovementsForOrder(exec, { orgId, orderId: entry.id });
  let cogs = 0;
  const saleCostByVariant = new Map<VariantId, number>();
  for (const movement of movements) {
    const variantId = asVariantId(movement.variantId);
    if (movement.reason === 'sale_out') {
      cogs += movement.costTotal;
      saleCostByVariant.set(
        variantId,
        (saleCostByVariant.get(variantId) ?? 0) + movement.costTotal,
      );
    } else if (movement.reason === 'return_in' || movement.reason === 'cancel_restore') {
      cogs -= movement.costTotal;
    }
  }
  const componentsByBundle = await catalogRepo.getBundleComponentMap(exec, { orgId });
  const variantIdSet = new Set<string>();
  for (const line of entry.lines) if (line.variantId) variantIdSet.add(line.variantId);
  const variantById = await catalogRepo.getVariantsByIds(exec, {
    orgId,
    variantIds: [...variantIdSet].map(asVariantId),
  });
  const lines = entry.lines.map((line): OrderLine => {
    const wire = toWireLine(line, variantById);
    const totalCost = lineTotalCost(line, saleCostByVariant, componentsByBundle);
    return totalCost === undefined ? wire : { ...wire, totalCost };
  });
  const kind = await channelKindOf(exec, orgId, entry.channelId);
  return toWireOrder(entry, lines, kind, {
    cogs: satang(cogs),
    margin: satang(entry.grandTotal - cogs),
  });
};

/**
 * Create a POS or wholesale bill and ship it immediately.
 *
 * Transaction outline:
 *   1. resolve the org's active channel for body.channelKind ('pos' | 'wholesale')
 *   2. load the requested customer; price every line: an explicit price wins,
 *      else the customer's tier price, else the variant selling price
 *   3. expandBundles(lines, componentsByBundle) - a bundle owns no stock
 *   4. lock the open lots of every expanded variant in variant id order
 *      (one global lock order, so concurrent bills queue without deadlocking)
 *   5. planMovements({ reason: 'sale_out', shortagePolicy: 'error' }) computes
 *      the ledger rows in memory; a shortage throws before any row is written
 *   6. insert orders + order_lines (status 'shipped': goods leave the shop now)
 *   7. recordMovements writes movements, consumptions and lot deltas
 *
 * The returned Order carries cogs / margin. lib/response.ts strips them for a
 * `sales` role, so the shop floor sees the bill but not the margin.
 */
export const createPosOrder = async (ctx: ServiceContext, body: CreateOrderBody): Promise<Order> =>
  ctx.db().transaction(async (tx) => {
    const orgId = ctx.auth.orgId;
    const channel = await channelRepo.getChannelByKind(tx, { orgId, kind: body.channelKind });
    if (!channel) {
      throw new StockHubError('not_found', `Org has no active ${body.channelKind} channel`, {
        channelKind: body.channelKind,
      });
    }
    const variantById = await catalogRepo.getVariantsByIds(tx, {
      orgId,
      variantIds: body.lines.map((line) => asVariantId(line.variantId)),
    });
    const customer = body.customerId
      ? await customerRepo.getCustomer(tx, { orgId, customerId: asCustomerId(body.customerId) })
      : undefined;
    if (body.customerId && !customer) {
      throw new StockHubError('not_found', 'ไม่พบลูกค้า', { customerId: body.customerId });
    }
    // Lines without an explicit price take the customer's tier price (or the
    // fallbacks resolvePrice documents). Resolving inside this transaction
    // keeps the bill's prices from reading a tier that changes mid-bill.
    const unpriced = body.lines
      .filter((line) => line.unitPrice === undefined)
      .map((line) => asVariantId(line.variantId));
    const resolved =
      unpriced.length === 0
        ? []
        : await resolvePrices(
            ctx,
            {
              variantIds: unpriced,
              customerId: customer ? asCustomerId(customer.id) : undefined,
            },
            tx,
          );
    const priceOf = new Map(resolved.map((r) => [r.variantId, r.price]));
    const pricedLines = body.lines.map((line) => {
      const variant = variantById.get(asVariantId(line.variantId));
      if (!variant) {
        throw new StockHubError('not_found', `Variant ${line.variantId} not found`, {
          variantId: line.variantId,
        });
      }
      const unitPrice = satang(
        line.unitPrice ?? priceOf.get(asVariantId(line.variantId)) ?? variant.sellingPrice,
      );
      const discount = satang(line.discount);
      const lineTotal = unitPrice * line.quantity - discount;
      if (lineTotal < 0) {
        // Mirrors the orders_grand_total_nonneg guard before Postgres 500s it.
        throw new StockHubError('validation_error', 'Discount exceeds the line total', {
          variantId: line.variantId,
          discount,
        });
      }
      return { variant, qty: line.quantity, unitPrice, discount };
    });
    const componentsByBundle = await catalogRepo.getBundleComponentMap(tx, { orgId });
    const expanded = expandBundles(
      pricedLines.map((line) => ({ variantId: asVariantId(line.variant.id), qty: line.qty })),
      componentsByBundle,
    );
    const warehouse = await inventoryRepo.getDefaultWarehouse(tx, { orgId });
    const warehouseId = asWarehouseId(warehouse.id);
    const lotsByVariant = new Map<VariantId, readonly StockLot[]>();
    for (const variantId of [...new Set(expanded.map((line) => line.variantId))].sort()) {
      lotsByVariant.set(
        variantId,
        await inventoryRepo.getOpenLotsForUpdate(tx, { orgId, variantId, warehouseId }),
      );
    }
    const now = ctx.clock.now();
    const planned = planMovements(
      {
        reason: 'sale_out',
        warehouseId,
        channelId: asChannelId(channel.id),
        occurredAt: now,
        lines: expanded,
        shortagePolicy: 'error',
      },
      { lotsByVariant },
    );
    // A local bill number in the same shape the seed uses, not a platform id.
    const stamp = now.toISOString().slice(0, 10).replaceAll('-', '');
    const serial = Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, '0');
    const grandTotal = satang(
      pricedLines.reduce((sum, line) => sum + line.unitPrice * line.qty - line.discount, 0),
    );
    const order = await orderRepo.upsertOrder(tx, {
      orgId,
      channelId: channel.id,
      externalOrderId: `POS-${stamp}-${serial}`,
      status: 'shipped',
      orderedAt: now,
      shippedAt: now,
      buyerName: body.customerName ?? customer?.name,
      customerId: customer?.id,
      priceTierId: customer?.priceTierId,
      grandTotal,
      raw: body.note === undefined ? { source: 'pos' } : { source: 'pos', note: body.note },
    });
    await orderRepo.replaceOrderLines(tx, {
      orderId: order.id,
      lines: pricedLines.map(
        (line): NewOrderLine => ({
          orgId,
          orderId: order.id,
          variantId: line.variant.id,
          platformSku: line.variant.sku,
          platformProductName: displayName(line.variant.productName, line.variant.name),
          qty: line.qty,
          unitPrice: line.unitPrice,
          discount: line.discount,
          matchSource: 'sku_exact',
        }),
      ),
    });
    await movementRepo.recordMovements(tx, {
      orgId,
      planned,
      createdBy: ctx.auth.userId,
      orderId: order.id,
      channelId: channel.id,
    });
    // Attribute cost back to the bill line: each planned movement belongs to
    // the line that expanded into it (a bundle line collects its components).
    const costByLineVariant = new Map<VariantId, number>();
    for (const [index, movement] of planned.entries()) {
      const source = expanded[index];
      if (!source) continue;
      const origin = source.fromBundleVariantId ?? source.variantId;
      costByLineVariant.set(origin, (costByLineVariant.get(origin) ?? 0) + movement.costTotal);
    }
    const cogs = satang(planned.reduce((sum, movement) => sum + movement.costTotal, 0));
    // Read the bill back with its generated line ids so the response matches
    // what GET /:id serves for the same order.
    const saved = await orderRepo.getOrderWithLines(tx, { orgId, orderId: order.id });
    if (!saved) throw new Error('Order vanished inside its own transaction');
    const lines = saved.lines.map((line): OrderLine => {
      const wire = toWireLine(line, variantById);
      const cost =
        line.variantId === null ? undefined : costByLineVariant.get(asVariantId(line.variantId));
      return cost === undefined ? wire : { ...wire, totalCost: satang(cost) };
    });
    return toWireOrder(saved, lines, channel.kind, {
      cogs,
      margin: satang(grandTotal - cogs),
    });
  });

/**
 * Re-read just-recorded movements with their running balances, in the order
 * they were recorded. listHistory is queried once per touched variant and
 * matched by id, because several of the new rows can share one variant.
 */
const readBackMovements = async (
  exec: DbExecutor,
  orgId: OrgId,
  recorded: readonly { movementId: string; variantId: VariantId }[],
): Promise<Movement[]> => {
  if (recorded.length === 0) return [];
  const wantedIds = new Set(recorded.map((movement) => movement.movementId));
  const perVariant = new Map<VariantId, number>();
  for (const movement of recorded) {
    perVariant.set(movement.variantId, (perVariant.get(movement.variantId) ?? 0) + 1);
  }
  const rows = new Map<string, movementRepo.HistoryRow>();
  for (const [variantId, count] of perVariant) {
    for (const row of await movementRepo.listHistory(exec, { orgId, variantId, limit: count })) {
      if (wantedIds.has(row.id)) rows.set(row.id, row);
    }
  }
  return recorded.flatMap(({ movementId }) => {
    const row = rows.get(movementId);
    return row ? [toMovementView(row)] : [];
  });
};

/**
 * Units still out with the customer per variant, and the exact lot slices the
 * sale consumed. Restore movements (return_in / cancel_restore) reduce the
 * outstanding count, so a cancel after a partial return can never push a lot
 * above the quantity it originally received.
 */
const outstandingSales = (
  movements: readonly movementRepo.OrderMovementRow[],
): {
  outstanding: Map<VariantId, number>;
  slicesByVariant: Map<VariantId, LotConsumption[]>;
} => {
  const outstanding = new Map<VariantId, number>();
  const slicesByVariant = new Map<VariantId, LotConsumption[]>();
  for (const movement of movements) {
    const variantId = asVariantId(movement.variantId);
    if (movement.reason === 'sale_out') {
      outstanding.set(variantId, (outstanding.get(variantId) ?? 0) - movement.qtyDelta);
      const slices = slicesByVariant.get(variantId) ?? [];
      slices.push(...movement.consumptions);
      slicesByVariant.set(variantId, slices);
    } else if (movement.reason === 'return_in' || movement.reason === 'cancel_restore') {
      outstanding.set(variantId, (outstanding.get(variantId) ?? 0) - movement.qtyDelta);
    }
  }
  return { outstanding, slicesByVariant };
};

/**
 * Cancel an order that has already moved stock.
 *
 * stockEffectOf decides the stock answer; on 'restore' the original
 * consumption slices of the sale go back to their lots with restoreFifo,
 * reason 'cancel_restore'. Re-buying at today's price would silently drift
 * every margin report. A pending order only flips the status; cancelling an
 * already cancelled order is a 400, not a second restore.
 */
export const cancelOrder = async (
  ctx: ServiceContext,
  orderId: OrderId,
  reason: string,
): Promise<Movement[]> =>
  ctx.db().transaction(async (tx) => {
    const orgId = ctx.auth.orgId;
    const entry = await orderRepo.getOrderWithLines(tx, { orgId, orderId });
    if (!entry) {
      throw new StockHubError('not_found', `Order ${orderId} not found`, { orderId });
    }
    const movements = await movementRepo.listMovementsForOrder(tx, { orgId, orderId: entry.id });
    const effect = stockEffectOf(
      entry.status,
      'cancelled',
      movements.some((movement) => movement.reason === 'sale_out'),
    );
    if (effect === 'invalid') {
      throw new StockHubError(
        'validation_error',
        `Cannot cancel an order in status ${entry.status}`,
        { orderId: entry.id, status: entry.status },
      );
    }
    const now = ctx.clock.now();
    if (effect === 'none') {
      // Nothing was ever deducted: only the status moves, the ledger stays.
      await orderRepo.setOrderStatus(tx, {
        orgId,
        orderId: entry.id,
        status: 'cancelled',
        cancelledAt: now,
      });
      return [];
    }
    const { outstanding, slicesByVariant } = outstandingSales(movements);
    const lines: MovementRequestLine[] = [];
    for (const [variantId, qty] of outstanding) {
      const restore = slicesByVariant.get(variantId) ?? [];
      if (qty <= 0 || restore.length === 0) continue;
      lines.push({ variantId, qty, restore });
    }
    const warehouse = await inventoryRepo.getDefaultWarehouse(tx, { orgId });
    const planned = planMovements(
      {
        reason: 'cancel_restore',
        warehouseId: asWarehouseId(warehouse.id),
        occurredAt: now,
        note: reason,
        lines,
      },
      // Restores re-credit recorded slices, so no lots need locking to plan.
      { lotsByVariant: new Map() },
    );
    const recorded = await movementRepo.recordMovements(tx, {
      orgId,
      planned,
      createdBy: ctx.auth.userId,
      orderId: entry.id,
      channelId: entry.channelId,
      note: reason,
    });
    await orderRepo.setOrderStatus(tx, {
      orgId,
      orderId: entry.id,
      status: 'cancelled',
      cancelledAt: now,
    });
    return readBackMovements(tx, orgId, recorded);
  });

/**
 * Accept a full or partial customer return. Reason: 'return_in'.
 *
 * Same restoreFifo() rule as cancelOrder, but quantity driven per requested
 * order line: a partial return re-credits the newest consumed slice first, so
 * a second partial return of the same order stays consistent. Returning more
 * units of a variant than are still outstanding is a 400, never a negative.
 *
 * Damaged returns must NOT come back as sellable stock: the 'return_in'
 * restores the cost, then an 'adjust_out' removes the unit again, planned
 * against lots re-locked AFTER the restore write, so both numbers stay true.
 * Status flips to 'returned' only when every sold unit is back.
 */
export const returnOrder = async (
  ctx: ServiceContext,
  orderId: OrderId,
  lines: readonly { orderLineId: string; quantity: number; restock: boolean }[],
): Promise<Movement[]> =>
  ctx.db().transaction(async (tx) => {
    const orgId = ctx.auth.orgId;
    const entry = await orderRepo.getOrderWithLines(tx, { orgId, orderId });
    if (!entry) {
      throw new StockHubError('not_found', `Order ${orderId} not found`, { orderId });
    }
    const movements = await movementRepo.listMovementsForOrder(tx, { orgId, orderId: entry.id });
    const { outstanding, slicesByVariant } = outstandingSales(movements);
    // A return is requested per order line but stock restores per variant,
    // so the requested quantities aggregate before anything is planned.
    const requested = new Map<VariantId, { restock: number; damaged: number }>();
    for (const line of lines) {
      const orderLine = entry.lines.find((candidate) => candidate.id === line.orderLineId);
      if (!orderLine?.variantId) {
        throw new StockHubError(
          'validation_error',
          `Order line ${line.orderLineId} has no variant`,
          { orderLineId: line.orderLineId },
        );
      }
      const variantId = asVariantId(orderLine.variantId);
      const slot = requested.get(variantId) ?? { restock: 0, damaged: 0 };
      if (line.restock) slot.restock += line.quantity;
      else slot.damaged += line.quantity;
      if (slot.restock + slot.damaged > (outstanding.get(variantId) ?? 0)) {
        throw new StockHubError(
          'validation_error',
          `Cannot return more units of ${orderLine.platformSku} than were sold`,
          {
            variantId,
            requested: slot.restock + slot.damaged,
            outstanding: outstanding.get(variantId) ?? 0,
          },
        );
      }
      requested.set(variantId, slot);
    }
    const now = ctx.clock.now();
    const warehouse = await inventoryRepo.getDefaultWarehouse(tx, { orgId });
    const restoreLines: MovementRequestLine[] = [];
    for (const [variantId, slot] of requested) {
      const qty = slot.restock + slot.damaged;
      restoreLines.push({ variantId, qty, restore: slicesByVariant.get(variantId) ?? [] });
    }
    const planned = planMovements(
      {
        reason: 'return_in',
        warehouseId: asWarehouseId(warehouse.id),
        occurredAt: now,
        lines: restoreLines,
      },
      // Restores re-credit recorded slices, so no lots need locking to plan.
      { lotsByVariant: new Map() },
    );
    const recorded = await movementRepo.recordMovements(tx, {
      orgId,
      planned,
      createdBy: ctx.auth.userId,
      orderId: entry.id,
      channelId: entry.channelId,
    });
    // Damaged units leave stock again. The lots must be re-locked after the
    // restore write so the adjust consumes the quantity that just came back.
    const damagedLines: MovementRequestLine[] = [];
    for (const [variantId, slot] of requested) {
      if (slot.damaged > 0) damagedLines.push({ variantId, qty: slot.damaged });
    }
    if (damagedLines.length > 0) {
      const lotsByVariant = new Map<VariantId, readonly StockLot[]>();
      for (const line of damagedLines) {
        lotsByVariant.set(
          line.variantId,
          await inventoryRepo.getOpenLotsForUpdate(tx, {
            orgId,
            variantId: line.variantId,
            warehouseId: asWarehouseId(warehouse.id),
          }),
        );
      }
      const damagedNote = 'สินค้ารับคืนชำรุด ไม่นำกลับเข้าสต็อกขายได้';
      const adjustPlanned = planMovements(
        {
          reason: 'adjust_out',
          warehouseId: asWarehouseId(warehouse.id),
          occurredAt: now,
          note: damagedNote,
          lines: damagedLines,
          shortagePolicy: 'error',
        },
        { lotsByVariant },
      );
      const adjustRecorded = await movementRepo.recordMovements(tx, {
        orgId,
        planned: adjustPlanned,
        createdBy: ctx.auth.userId,
        orderId: entry.id,
        channelId: entry.channelId,
        note: damagedNote,
      });
      recorded.push(...adjustRecorded);
    }
    const everySoldUnitBack =
      requested.size > 0 &&
      [...requested.keys()].every((variantId) => {
        const slot = requested.get(variantId);
        if (!slot) return false;
        return slot.restock + slot.damaged >= (outstanding.get(variantId) ?? 0);
      });
    if (everySoldUnitBack) {
      await orderRepo.setOrderStatus(tx, { orgId, orderId: entry.id, status: 'returned' });
    }
    return readBackMovements(tx, orgId, recorded);
  });
