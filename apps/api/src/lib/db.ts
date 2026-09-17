/**
 * Database seam.
 *
 * WHY THIS FILE EXISTS
 * The persistence layer lives in `packages/db` (Drizzle + Postgres). The API
 * must not know about Drizzle types, so it talks to the structural interface
 * below. That keeps routes/services testable with a fake and lets the db
 * package change its internals freely.
 *
 * NEXT DEVELOPER - one-line switch to the real client:
 *   import { createDb, type Db } from '@stockhub/db';
 *   ...
 *   export type DbClient = Db;
 *   export const openDb = (connectionString: string): DbClient =>
 *     createDb({ connectionString });
 *
 * Until then `openDb` throws NotImplementedError, which every route that needs
 * real data surfaces as HTTP 501. Routes serving MOCK data never call it, so
 * the demo renders end to end without a database.
 */

import { NotImplementedError } from '@stockhub/core';
import type { Env } from '../env';

/**
 * The slice of `packages/db` the API depends on.
 *
 * Only two things belong here: a transaction boundary and a close hook. Queries
 * belong in repository functions exported by `packages/db`, called from
 * src/services/*, so SQL never leaks into a route handler.
 */
export interface DbClient {
  /**
   * Run `fn` inside ONE Postgres transaction.
   *
   * Every stock mutation must go through this. FIFO consumption reads lot rows
   * with `SELECT ... FOR UPDATE` and writes movements from the same snapshot;
   * doing that outside a transaction double-spends a lot under concurrency.
   */
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
  /** Release the underlying connection. Called by middleware/db.ts on finish. */
  close(): Promise<void>;
}

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

/**
 * Open a client for one request.
 *
 * TODO(template): replace the throw with `createDb` from @stockhub/db.
 */
export const openDb = (_connectionString: string): DbClient => {
  throw new NotImplementedError('openDb (wire @stockhub/db here)');
};

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
      await client?.close();
      client = undefined;
    },
  };
};
