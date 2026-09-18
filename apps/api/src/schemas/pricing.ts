/**
 * Zod schemas for the customer and price tier endpoints.
 *
 * Query params arrive as strings, so limit coerces. `priceTierId` accepts an
 * explicit null (clear the tier on PATCH) and undefined (leave it alone).
 */

import { z } from 'zod';
import { idString } from './common';

export const customerParam = z.object({ customerId: idString });
export type CustomerParam = z.infer<typeof customerParam>;

export const tierParam = z.object({ tierId: idString });
export type TierParam = z.infer<typeof tierParam>;

export const customerInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(160).optional(),
  note: z.string().trim().max(280).optional(),
  priceTierId: idString.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const listCustomersQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuery>;
