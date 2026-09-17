/** Query schemas for reporting endpoints. */

import { z } from 'zod';
import { idString } from './common';

export const cogsReportQuery = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
    channelId: idString.optional(),
    groupBy: z.enum(['day', 'channel', 'variant']).default('day'),
  })
  .refine((value) => value.from <= value.to, { message: '`from` must not be after `to`' });

export type CogsReportQuery = z.infer<typeof cogsReportQuery>;
