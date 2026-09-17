/**
 * Dependencies every application service receives.
 *
 * Services take this object instead of a Hono context, so they can be unit
 * tested with a fake db, an in-memory StoragePort and a fixed clock. Keep Hono
 * out of src/services entirely.
 */

import { systemClock } from '@stockhub/core';
import type { Clock, StoragePort } from '@stockhub/core';
import type { Context } from 'hono';
import { createR2Storage } from '../adapters/r2-storage';
import type { DbClient } from '../lib/db';
import type { AppEnv, AuthContext } from '../types/app';

export interface ServiceContext {
  auth: AuthContext;
  /** Opened lazily: a service that only reads mock data never connects. */
  db: () => DbClient;
  storage: StoragePort;
  clock: Clock;
  requestId: string;
}

/** Build the service context from a request. The only Hono-aware helper here. */
export const serviceContext = (c: Context<AppEnv>): ServiceContext => ({
  auth: c.get('auth'),
  db: () => c.get('db').get(),
  storage: createR2Storage(c.env.IMPORTS_BUCKET),
  clock: systemClock,
  requestId: c.get('requestId'),
});
