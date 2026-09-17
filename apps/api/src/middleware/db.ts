/**
 * Per-request database handle.
 *
 * WHY PER REQUEST AND NOT A MODULE-LEVEL SINGLETON
 * A Worker isolate is not a long-lived server process. It can be created,
 * frozen and destroyed between requests, and I/O objects cannot be shared
 * across requests: a socket captured in module scope belongs to the invocation
 * that opened it and using it later throws ("Cannot perform I/O on behalf of a
 * different request"). So: open inside the request, close when it ends.
 *
 * The cost of opening is absorbed by the HYPERDRIVE binding, which keeps the
 * real Postgres pool on Cloudflare's side and hands the Worker a cheap local
 * connection. That is why wrangler.toml documents Hyperdrive as required for
 * deploys and optional for local dev.
 *
 * The handle is LAZY (see lib/db.ts): mock routes and /health never open a
 * connection, so the demo works with no database running.
 */

import { createMiddleware } from 'hono/factory';
import { lazyDb } from '../lib/db';
import type { AppEnv } from '../types/app';

export const dbMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const accessor = lazyDb(c.env);
  c.set('db', accessor);
  try {
    await next();
  } finally {
    // Only closes if a route really opened a connection.
    if (accessor.opened) {
      // Do not await forever on teardown; a failed close must not mask the response.
      await accessor.close().catch(() => undefined);
    }
  }
});
