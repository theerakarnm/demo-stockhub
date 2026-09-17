/**
 * Database client factory.
 *
 * ONE driver for both runtimes: postgres.js (`postgres`).
 *
 *  - Local dev, the seed script and tests connect straight to the Docker
 *    Postgres with DATABASE_URL.
 *  - Cloudflare Workers connect through Hyperdrive. Hyperdrive hands the Worker
 *    a normal Postgres connection string in `env.HYPERDRIVE.connectionString`,
 *    so the exact same driver and the exact same schema work there. No second
 *    client, no `drizzle-orm/neon-http` fork of every repository.
 *
 * Worker usage (apps/api):
 *
 *   // wrangler.jsonc
 *   // "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<your-hyperdrive-id>" }]
 *   export interface Env { HYPERDRIVE: Hyperdrive }
 *
 *   const db = createDb(env.HYPERDRIVE.connectionString, { runtime: 'worker' });
 *   // ... use db for this request only, then let it go out of scope.
 *
 * Why `runtime: 'worker'` matters:
 *   max: 5          a Worker isolate is short lived, a big pool is wasted
 *   fetch_types: false  skips the extra round trip postgres.js makes to read
 *                       the type catalogue on connect - Hyperdrive pools are
 *                       already warm and the round trip costs real latency
 *   prepare: false  named prepared statements do not survive a pooled
 *                   connection being handed to another isolate
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Runtime = 'node' | 'worker';

export interface CreateDbOptions {
  /** Defaults to 'node' (local dev, seed, tests). Use 'worker' behind Hyperdrive. */
  runtime?: Runtime;
  /** Override the pool size chosen by `runtime`. */
  max?: number;
  /** Log every statement. Handy while building a repository query. */
  debug?: boolean;
}

/**
 * Build the raw postgres.js client.
 *
 * Exported because the seed runner needs the handle to call `.end()`, and
 * because a few maintenance scripts want plain SQL without the ORM.
 */
export const createPostgresClient = (
  connectionString: string,
  options: CreateDbOptions = {},
): postgres.Sql => {
  const runtime = options.runtime ?? 'node';
  const isWorker = runtime === 'worker';

  return postgres(connectionString, {
    max: options.max ?? (isWorker ? 5 : 10),
    fetch_types: !isWorker,
    prepare: !isWorker,
    // A Worker request should fail fast rather than hold the isolate open.
    idle_timeout: isWorker ? 20 : undefined,
    connect_timeout: 10,
    onnotice: options.debug ? undefined : () => {},
  });
};

/**
 * The application database handle, typed with the full schema.
 *
 * `db.query.variants.findMany({ with: { product: true } })` works because the
 * relations in src/schema/relations.ts are part of `schema`.
 */
export const createDb = (connectionString: string, options: CreateDbOptions = {}) =>
  drizzle(createPostgresClient(connectionString, options), {
    schema,
    logger: options.debug ?? false,
  });

/** Wrap an existing postgres.js client, e.g. one shared with a script. */
export const createDbFromClient = (client: postgres.Sql, options: { debug?: boolean } = {}) =>
  drizzle(client, { schema, logger: options.debug ?? false });

/** The type every repository and API route should depend on. */
export type Db = ReturnType<typeof createDb>;

/**
 * A transaction handle. Repositories that must run inside one transaction
 * (anything touching FIFO) accept `Db | DbTransaction`, so the caller decides.
 *
 *   await db.transaction(async (tx) => { await recordMovements(tx, ...); });
 */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * What a repository function accepts.
 *
 * It is a structural subset of `Db` rather than `Db | DbTransaction` on
 * purpose: a union of the two makes TypeScript complain when you call
 * `.select()` on it, while the subset below accepts both the pool handle and a
 * transaction handle with no casts.
 */
export type DbExecutor = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export type Schema = typeof schema;

/**
 * Read DATABASE_URL with a clear error instead of an undefined connection.
 * Keep credentials in the environment. Never commit a real one.
 */
export const requireDatabaseUrl = (
  env: Record<string, string | undefined> = process.env,
): string => {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env, then run `bun run docker:up`.',
    );
  }
  return url;
};
