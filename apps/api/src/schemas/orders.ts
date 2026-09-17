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
  customerName: z.string().trim().max(160).optional(),
  note: z.string().trim().max(280).optional(),
  lines: z.array(orderLineBody).min(1).max(200),
});

export type CreateOrderBody = z.infer<typeof createOrderBody>;
export const orderParam = z.object({ id: idString });
