/** Query schema for the movement history routes. */

import { MOVEMENT_REASONS } from '@stockhub/core';
import { z } from 'zod';
import { cursorPagination, idString } from './common';

export const listMovementsQuery = cursorPagination.extend({
  variantId: idString.optional(),
  /** All movements caused by one order, for the bill's lot-trace card. */
  orderId: idString.optional(),
  reason: z.enum(MOVEMENT_REASONS).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;
