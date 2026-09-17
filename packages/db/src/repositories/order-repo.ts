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
} from '@stockhub/core';
import { and, desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type NewOrder, type NewOrderLine, type Order, orderLines, orders } from '../schema';

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
 * React to a status change coming from a later export file.
 *
 * TODO(template) decision table:
 *   pending   -> shipped     : consume FIFO (sale_out)
 *   shipped   -> cancelled   : cancel_restore, using the ORIGINAL consumption
 *   delivered -> returned    : return_in, also using the original consumption
 *   pending   -> cancelled   : nothing moved yet, only update the status
 * Read the movements of the order first (listMovementsForOrder) so you never
 * restore stock that was never deducted.
 */
export const applyStatusChange = async (
  _exec: DbExecutor,
  _params: { orgId: OrgId; orderId: string; nextStatus: OrderStatus },
): Promise<void> => {
  throw new NotImplementedError('applyStatusChange');
};
