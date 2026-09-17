/** Query schemas for the inventory routes. */

import { z } from 'zod';
import { booleanFlag, cursorPagination, idString } from './common';

export const listInventoryQuery = cursorPagination.extend({
  /** Free text over SKU and product name. */
  q: z.string().trim().min(1).max(120).optional(),
  /** Restrict to variants listed on one channel (via channel_listings). */
  channelId: idString.optional(),
  /** Only rows where available <= lowStockThreshold. */
  lowStock: booleanFlag.optional(),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuery>;

export const variantParam = z.object({ variantId: idString });

/** Manual stock correction. Guarded by the `stock:adjust` permission. */
export const adjustStockBody = z.object({
  variantId: idString,
  /** Signed delta. Positive becomes adjust_in, negative adjust_out. */
  qtyDelta: z
    .number()
    .int()
    .refine((value) => value !== 0, 'qtyDelta must not be 0'),
  /** Required so the movement history explains itself later. */
  note: z.string().trim().min(3).max(280),
  /** Satang. Needed only when the delta opens a new FIFO lot (adjust_in). */
  unitCost: z.number().int().nonnegative().optional(),
});

export type AdjustStockBody = z.infer<typeof adjustStockBody>;
