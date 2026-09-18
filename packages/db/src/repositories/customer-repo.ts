/**
 * Customers: people and shops that buy on credit. Track D replaces this file.
 */

import { NotImplementedError } from '@stockhub/core';
import type { DbExecutor } from '../client';

export const listCustomers = async (_exec: DbExecutor, _input: unknown): Promise<never> => {
  throw new NotImplementedError('customerRepo.listCustomers');
};
