/**
 * Listings: learned platform-SKU mappings. Track C replaces this file.
 */

import { NotImplementedError } from '@stockhub/core';
import type { DbExecutor } from '../client';

export const upsertListing = async (_exec: DbExecutor, _input: unknown): Promise<never> => {
  throw new NotImplementedError('listingRepo.upsertListing');
};
