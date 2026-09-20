/** Query schemas for reporting endpoints. */

import { z } from 'zod';
import { idString } from './common';

/** Report window in days, today included. Bounded so a typo cannot ask for
 *  ten years of ledger in one request. */
const daysParam = z.coerce.number().int().min(1).max(365);

export const channelSalesQuery = z.object({
  days: daysParam.default(7),
});

export type ChannelSalesQuery = z.infer<typeof channelSalesQuery>;

export const varianceQuery = z.object({
  days: daysParam.default(7),
});

export type VarianceQuery = z.infer<typeof varianceQuery>;

export const cogsReportQuery = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
    channelId: idString.optional(),
  })
  .refine((value) => value.from <= value.to, { message: '`from` must not be after `to`' });

export type CogsReportQuery = z.infer<typeof cogsReportQuery>;

/** GET /reports/profit: a wide date window plus an optional channel filter. */
export const profitQuery = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
    channelId: idString.optional(),
    // The per-order page is capped so the UI can never ask for the whole year
    // of ledger rows at once; aggregates always cover the whole window.
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  })
  .refine((value) => value.from <= value.to, { message: '`from` must not be after `to`' })
  .refine((value) => (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 366, {
    message: 'window is capped at 366 days',
  });

export type ProfitQuery = z.infer<typeof profitQuery>;
