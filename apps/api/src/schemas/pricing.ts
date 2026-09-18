/**
 * Zod schemas for customers, price tiers and price resolution.
 *
 * Every customer-facing string is trimmed and length-capped at the boundary so
 * a fat-fingered paste cannot bloat the row. `priceTierId` is nullable on
 * input: sending null explicitly clears the tier and puts the customer back on
 * the standard selling price.
 */

import { z } from 'zod';
import { idString } from './common';

export const customerParam = z.object({ id: idString });

export const customerInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(160).optional(),
  note: z.string().trim().max(280).optional(),
  priceTierId: idString.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const listCustomersQuery = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const tierParam = z.object({ id: idString });

/** One save on the matrix screen writes the whole edited row of one tier. */
export const putTierPricesBody = z.object({
  prices: z
    .array(
      z.object({
        variantId: idString,
        // null deletes the cell so the variant falls back to the standard price.
        price: z.number().int().nonnegative().nullable(),
      }),
    )
    .min(1)
    .max(500),
});

/** GET /pricing/resolve?variantIds=a,b,c&customerId=... or &priceTierId=... */
export const resolveQuery = z.object({
  variantIds: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  customerId: idString.optional(),
  priceTierId: idString.optional(),
});
