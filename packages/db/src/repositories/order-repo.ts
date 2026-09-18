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
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
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
