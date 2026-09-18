/**
 * Orders from every channel.
 *
 * The one rule to remember: writing an order is idempotent. The shop owner will
 * re-upload the same export file. `upsertOrder` keys on (channel_id,
 * external_order_id) so a second import updates the row instead of creating a
 * twin, and stock only moves on a real status change.
 */

import {
  type ChannelId,
  type ImportBatchId,
  NotImplementedError,
  type OrderStatus,
  type OrgId,
  StockHubError,
} from '@stockhub/core';
import { and, asc, desc, eq, gte, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import {
  type NewOrder,
  type NewOrderLine,
  type Order,
  type OrderLine,
  orderLines,
  orders,
} from '../schema';

/**
 * Insert or refresh one order.
 *
 * `onConflictDoUpdate` on the unique index is what makes a re-import safe. Note
 * what is NOT updated: created_at and import_batch_id keep pointing at the
 * first file that introduced the order, which keeps the audit trail stable.
 */
export const upsertOrder = async (exec: DbExecutor, values: NewOrder): Promise<Order> => {
  const [row] = await exec
    .insert(orders)
    .values(values)
    .onConflictDoUpdate({
      target: [orders.channelId, orders.externalOrderId],
      set: {
        status: values.status ?? 'pending',
        shippedAt: values.shippedAt ?? null,
        cancelledAt: values.cancelledAt ?? null,
        buyerName: values.buyerName ?? null,
        grandTotal: values.grandTotal ?? 0,
        raw: values.raw ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error('Upsert into orders returned no row');
  return row;
};

/** Replace the lines of an order. Cheaper and simpler than diffing them. */
export const replaceOrderLines = async (
  exec: DbExecutor,
  params: { orderId: string; lines: readonly NewOrderLine[] },
): Promise<void> => {
  await exec.delete(orderLines).where(eq(orderLines.orderId, params.orderId));
  if (params.lines.length > 0) {
    await exec.insert(orderLines).values([...params.lines]);
  }
};

/**
 * The orders of one channel by platform order number - the read behind the
 * import preview's duplicate detection: an external id that already exists here
 * is shown as skipped instead of being deducted a second time.
 */
export const listOrdersByExternalIds = async (
  exec: DbExecutor,
  params: { orgId: OrgId; channelId: ChannelId; externalIds: readonly string[] },
): Promise<Order[]> => {
  if (params.externalIds.length === 0) return [];
  return exec
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.orgId, params.orgId),
        eq(orders.channelId, params.channelId),
        inArray(orders.externalOrderId, [...params.externalIds]),
      ),
    );
};

export interface ListOrdersQuery {
  orgId: OrgId;
  channelId?: ChannelId;
  status?: OrderStatus;
  importBatchId?: ImportBatchId;
  limit?: number;
  offset?: number;
}

export const listOrders = async (exec: DbExecutor, query: ListOrdersQuery): Promise<Order[]> => {
  const filters = [eq(orders.orgId, query.orgId)];
  if (query.channelId) filters.push(eq(orders.channelId, query.channelId));
  if (query.status) filters.push(eq(orders.status, query.status));
  if (query.importBatchId) filters.push(eq(orders.importBatchId, query.importBatchId));

  return exec
    .select()
    .from(orders)
    .where(and(...filters))
    .orderBy(desc(orders.orderedAt))
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0);
};

/**
 * Attach a variant to a previously unmatched line.
 *
 * TODO(template): this is the import preview 'fix it' action. Besides updating
 * the line it must upsert a channel_listings row with match_source 'manual', so
 * the next import of the same platform SKU matches by itself. Doing only half
 * of it is the classic bug here.
 */
export const resolveOrderLineMatch = async (
  _exec: DbExecutor,
  _params: { orgId: OrgId; orderLineId: string; variantId: string },
): Promise<void> => {
  throw new NotImplementedError('resolveOrderLineMatch');
};

/**
 * Read one order together with its lines - the shape every status mutation and
 * every order detail response needs. Lines come back in insertion order so the
 * bill renders the way it was typed.
 */
export const getOrderWithLines = async (
  exec: DbExecutor,
  params: { orgId: OrgId; orderId: string },
): Promise<(Order & { lines: OrderLine[] }) | undefined> => {
  const [order] = await exec
    .select()
    .from(orders)
    .where(and(eq(orders.orgId, params.orgId), eq(orders.id, params.orderId)))
    .limit(1);
  if (!order) return undefined;
  const lines = await exec
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, order.id))
    .orderBy(asc(orderLines.createdAt));
  return { ...order, lines };
};

/**
 * Flip the status of one order and report what it was.
 *
 * The row is read FOR UPDATE first, so two writers racing on the same order
 * (a platform webhook and the POS cancel button) serialise here instead of
 * both planning stock movements for the same transition. `shippedAt` is set
 * only when the new status is `shipped`; the ship moment is history and must
 * survive later cancels and returns.
 */
export const setOrderStatus = async (
  exec: DbExecutor,
  params: {
    orgId: OrgId;
    orderId: string;
    status: OrderStatus;
    /** Business time of the cancellation, when the order is being cancelled. */
    cancelledAt?: Date;
  },
): Promise<{ previous: OrderStatus }> => {
  const [current] = await exec
    .select({ status: orders.status })
    .from(orders)
    .where(and(eq(orders.orgId, params.orgId), eq(orders.id, params.orderId)))
    .for('update');
  if (!current) {
    throw new StockHubError('not_found', `Order ${params.orderId} not found`, {
      orderId: params.orderId,
    });
  }
  await exec
    .update(orders)
    .set({
      status: params.status,
      cancelledAt: params.cancelledAt ?? null,
      ...(params.status === 'shipped' ? { shippedAt: new Date() } : {}),
    })
    .where(and(eq(orders.orgId, params.orgId), eq(orders.id, params.orderId)));
  return { previous: current.status };
};

// ---------------------------------------------------------------------------
// Report aggregates (read only).
// ---------------------------------------------------------------------------

/** Statuses that cancel a sale out of the net sales reports. */
const NOT_A_SALE: readonly OrderStatus[] = ['cancelled', 'returned'];

export interface ChannelSalesRow {
  channelId: string;
  /** Distinct orders behind the row. */
  orders: number;
  unitsSold: number;
  /** Sum of qty * unit_price - discount over the channel's lines, in satang. */
  revenue: number;
}

/**
 * Net sales per channel straight from orders + order lines.
 *
 * Cancelled and returned orders are excluded: they are not sales. Lines whose
 * variant is still unmatched are excluded too - they never deduct stock, so
 * counting them here would make this report disagree with the movement ledger,
 * which is the exact data drift StockHub exists to kill.
 */
export const sumChannelSales = async (
  exec: DbExecutor,
  params: { orgId: OrgId; from: Date },
): Promise<ChannelSalesRow[]> => {
  const rows = await exec
    .select({
      channelId: orders.channelId,
      orders: sql<number>`count(distinct ${orders.id})::int`.as('orders'),
      unitsSold: sql<number>`coalesce(sum(${orderLines.qty}), 0)::int`.as('units_sold'),
      revenue:
        sql<number>`coalesce(sum(${orderLines.qty} * ${orderLines.unitPrice} - ${orderLines.discount}), 0)::bigint`.as(
          'revenue',
        ),
    })
    .from(orders)
    .innerJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(
      and(
        eq(orders.orgId, params.orgId),
        gte(orders.orderedAt, params.from),
        notInArray(orders.status, [...NOT_A_SALE]),
        isNotNull(orderLines.variantId),
      ),
    )
    .groupBy(orders.channelId);
  return rows.map((row) => ({
    channelId: row.channelId,
    orders: Number(row.orders),
    unitsSold: Number(row.unitsSold),
    revenue: Number(row.revenue),
  }));
};

/**
 * Distinct platform SKUs still waiting for a manual match - the work queue
 * counter on the dashboard. Order lines keep their platform SKU after the
 * order is stored, so this covers every tenant-wide unmatched line.
 */
export const countDistinctUnmatchedSkus = async (
  exec: DbExecutor,
  params: { orgId: OrgId },
): Promise<number> => {
  const [row] = await exec
    .select({
      skus: sql<number>`count(distinct ${orderLines.platformSku})::int`.as('skus'),
    })
    .from(orderLines)
    .where(and(eq(orderLines.orgId, params.orgId), eq(orderLines.matchSource, 'unmatched')));
  return Number(row?.skus ?? 0);
};
