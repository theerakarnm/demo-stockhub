/** Schemas for reading orders and creating a POS / wholesale bill. */

import { ORDER_STATUSES } from '@stockhub/core';
import { z } from 'zod';
import { cursorPagination, idString } from './common';

export const listOrdersQuery = cursorPagination.extend({
  channelId: idString.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;

const orderLineBody = z.object({
  variantId: idString,
  quantity: z.number().int().positive(),
  /** Satang. Omit to use the variant's current selling price. */
  unitPrice: z.number().int().nonnegative().optional(),
  discount: z.number().int().nonnegative().default(0),
});

/**
 * Only 'pos' and 'wholesale' orders are created through the API. Marketplace
 * orders always arrive through an import, never by hand, otherwise the stock
 * number stops matching the platform.
 */
export const createOrderBody = z.object({
  channelKind: z.enum(['pos', 'wholesale']),
  /** Links the bill to a wholesale customer; its tier prices unpriced lines. */
  customerId: idString.optional(),
  customerName: z.string().trim().max(160).optional(),
  note: z.string().trim().max(280).optional(),
  lines: z.array(orderLineBody).min(1).max(200),
});

export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderParam = z.object({ id: idString });

/** Why a bill is being cancelled; stored as the note on the cancel_restore rows. */
export const cancelOrderBody = z.object({
  reason: z.string().trim().min(3).max(280),
});

export type CancelOrderBody = z.infer<typeof cancelOrderBody>;

const returnLineBody = z.object({
  orderLineId: idString,
  quantity: z.number().int().positive(),
  /** Damaged units restore the cost but never re-enter sellable stock. */
  restock: z.boolean().default(true),
});

/** Partial returns are allowed; each call restores only the units it lists. */
export const returnOrderBody = z.object({
  lines: z.array(returnLineBody).min(1),
});

export type ReturnOrderBody = z.infer<typeof returnOrderBody>;
