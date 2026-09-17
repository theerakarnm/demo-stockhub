/**
 * Shared zod pieces. Import these instead of re-typing the same coercions,
 * so every endpoint rejects bad input the same way.
 *
 * Query params arrive as strings, so numbers use z.coerce and booleans use a
 * `'true'`-ish transform. Errors bubble to middleware/error.ts as 400
 * validation_error.
 */

import { CHANNEL_KINDS } from '@stockhub/core';
import { z } from 'zod';

/** Max rows one list call may return. Keeps a Worker inside its CPU budget. */
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;

export const cursorPagination = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export type CursorPagination = z.infer<typeof cursorPagination>;

export const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/** Ids are opaque strings here. Existence is checked by the query, not by zod. */
export const idString = z.string().min(1).max(64);

export const channelKind = z.enum(CHANNEL_KINDS);

/** Inclusive date range used by reports and movement filters. */
export const dateRange = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must not be after `to`',
  });
