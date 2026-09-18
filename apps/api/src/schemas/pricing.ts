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
