/**
 * Price tiers: the per-tier price matrix. Track D replaces this file.
 */

import { NotImplementedError } from '@stockhub/core';
import type { DbExecutor } from '../client';

export const listTiers = async (_exec: DbExecutor, _input: unknown): Promise<never> => {
  throw new NotImplementedError('pricingRepo.listTiers');
};
