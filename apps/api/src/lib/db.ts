/**
 * Database seam.
 *
 * The persistence layer lives in `packages/db` (Drizzle + Postgres). The API
 * holds that Drizzle handle behind the `DbClient` alias, so routes and services
 * stay testable with a fake and the db package can change its internals freely.
 */

import { NotImplementedError } from '@stockhub/core';
import { type Db, createDb } from '@stockhub/db';
import type { Env } from '../env';

/** The Drizzle handle. Repositories take `DbExecutor`, which both `Db` and a transaction satisfy. */
export type DbClient = Db;

/**
 * Pick the connection string for this request.
 *
 * Order matters:
 *   1. HYPERDRIVE binding - the deployed path. Cloudflare pools and caches, so
 *      a Worker isolate never opens a raw connection to the customer database.
 *   2. DATABASE_URL from .dev.vars - local `wrangler dev` against docker compose.
 */
export const resolveConnectionString = (env: Env): string => {
  const fromHyperdrive = env.HYPERDRIVE?.connectionString;
  if (fromHyperdrive) return fromHyperdrive;
  if (env.DATABASE_URL) return env.DATABASE_URL;
  throw new NotImplementedError('database connection (bind HYPERDRIVE or set DATABASE_URL)');
};

export const openDb = (connectionString: string): DbClient =>
  createDb(connectionString, { runtime: 'worker' });

/**
 * Lazy handle stored on the Hono context.
 *
 * A route asks for the connection only when it really queries, so mock routes
 * and /health stay fast and work with no database at all.
 */
export interface DbAccessor {
  /** Opens on first call, then memoises for the rest of the request. */
  get(): DbClient;
  /** True when a connection was actually opened (used by the close hook). */
  readonly opened: boolean;
  close(): Promise<void>;
}

export const lazyDb = (env: Env): DbAccessor => {
  let client: DbClient | undefined;
  return {
    get() {
      client ??= openDb(resolveConnectionString(env));
      return client;
    },
    get opened() {
      return client !== undefined;
    },
    async close() {
      // `Db` has no close(); the postgres.js client hangs off `$client`. The
      // timeout keeps a Worker from hanging on teardown.
      await client?.$client.end({ timeout: 5 });
      client = undefined;
    },
  };
};
