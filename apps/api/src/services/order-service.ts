/**
 * Orders: read the normalised order list, and create a POS / wholesale bill.
 *
 * A POS bill is the ONLY order this system creates itself. Marketplace orders
 * always come from an import, so the local number keeps matching the platform.
 *
 * The difference that matters for costing: a POS sale must refuse to oversell
 * (consumeFifo with onShortage 'error'), while an imported marketplace sale must
 * accept a shortfall, because that sale already happened in the real world.
 */

import { NotImplementedError } from '@stockhub/core';
import type { OrderId } from '@stockhub/core';
import type { CreateOrderBody, ListOrdersQuery } from '../schemas/orders';
import type { Movement, Order, Page } from '../types/contract';
import type { ServiceContext } from './context';

/**
 * Page of orders, newest first, keyset paginated on (ordered_at, id).
 *
 * Join order_lines in a second query keyed by order id rather than one big join,
 * so a 50 line wholesale bill does not blow the page size out.
 */
export const listOrders = async (
  _ctx: ServiceContext,
  _query: ListOrdersQuery,
): Promise<Page<Order>> => {
  throw new NotImplementedError('listOrders');
};

export const getOrder = async (_ctx: ServiceContext, _orderId: OrderId): Promise<Order> => {
  throw new NotImplementedError('getOrder');
};

/**
 * Create a POS or wholesale bill and ship it immediately.
 *
 * Transaction outline:
 *   await ctx.db().transaction(async (tx) => {
 *     1. resolve the org's channel for body.channelKind ('pos' | 'wholesale')
 *     2. load variants, default missing unitPrice to the variant selling price
 *     3. expandBundles(lines, componentsByBundle)
 *     4. lock open lots of every component: SELECT ... FOR UPDATE
 *     5. planMovements({ reason: 'sale_out', channelId, orderId, occurredAt })
 *        with consumeFifo(..., { onShortage: 'error' }) -> InsufficientStockError
 *        becomes HTTP 409, which the POS screen shows as "สต๊อกไม่พอ"
 *     6. insert orders + order_lines (status 'shipped': goods leave the shop now)
 *     7. insert stock_movements + lot consumptions, update stock_lots
 *   });
 *
 * The returned Order carries cogs / margin. lib/response.ts strips them for a
 * `sales` role, so the shop floor sees the bill but not the margin.
 */
export const createPosOrder = async (
  _ctx: ServiceContext,
  _body: CreateOrderBody,
): Promise<Order> => {
  throw new NotImplementedError('createPosOrder');
};

/**
 * Cancel an order that has already moved stock.
 *
 * Uses restoreFifo(originalConsumption, qty) so the exact cost slices the sale
 * consumed go back to the lots they came from. Reason: 'cancel_restore'.
 * Re-buying at today's price would silently drift every margin report.
 */
export const cancelOrder = async (
  _ctx: ServiceContext,
  _orderId: OrderId,
  _reason: string,
): Promise<Movement[]> => {
  throw new NotImplementedError('cancelOrder');
};

/**
 * Accept a full or partial customer return. Reason: 'return_in'.
 *
 * Same restoreFifo() rule as cancelOrder, but quantity driven: a partial return
 * re-credits the newest consumed slice first, so a second partial return of the
 * same order stays consistent.
 *
 * Damaged returns must NOT come back as sellable stock: write 'return_in' to
 * restore the cost, then 'adjust_out' with a note, so both numbers stay true.
 */
export const returnOrder = async (
  _ctx: ServiceContext,
  _orderId: OrderId,
  _lines: readonly { orderLineId: string; quantity: number; restock: boolean }[],
): Promise<Movement[]> => {
  throw new NotImplementedError('returnOrder');
};
