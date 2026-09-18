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
    groupBy: z.enum(['day', 'channel', 'variant']).default('day'),
  })
  .refine((value) => value.from <= value.to, { message: '`from` must not be after `to`' });

export type CogsReportQuery = z.infer<typeof cogsReportQuery>;
