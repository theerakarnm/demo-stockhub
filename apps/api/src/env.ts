/**
 * Worker bindings and the one validated accessor for them.
 *
 * Bindings arrive untyped at the edge of the Worker, so we validate once per
 * request in `appConfig()` and pass the parsed object around. A missing or
 * malformed var then fails loudly at the first request instead of producing an
 * `undefined` three layers deeper.
 *
 * Add a binding:
 *   1. declare it in wrangler.toml
 *   2. add the field here
 *   3. extend `configSchema` if it is a string var that needs validation
 */

import type { Role } from '@stockhub/core';
import { SEED_IDS } from '@stockhub/db';
import { z } from 'zod';

/** Shape of `c.env` inside every Hono handler. Mirrors wrangler.toml exactly. */
export interface Env {
  // --- vars -----------------------------------------------------------------
  ENVIRONMENT: string;
  API_VERSION: string;
  /** Comma separated allow-list for browser CORS. */
  CORS_ORIGINS: string;
  /** 'true' enables the x-demo-role header auth. See middleware/auth.ts. */
  DEMO_MODE: string;

  // --- secrets (.dev.vars locally, `wrangler secret put` in production) -----
  /** Direct Postgres URL. Used when HYPERDRIVE is not bound (local dev). */
  DATABASE_URL?: string;

  // --- resource bindings ----------------------------------------------------
  /** Original uploaded order export files. Implemented by adapters/r2-storage.ts. */
  IMPORTS_BUCKET: R2Bucket;
  /** Pooled Postgres. Optional so local dev can run on DATABASE_URL alone. */
  HYPERDRIVE?: Hyperdrive;
}

/**
 * Vars are always strings. Accept the common spellings and default to false, so
 * a missing DEMO_MODE fails CLOSED instead of enabling header auth by accident.
 */
const boolish = z
  .string()
  .optional()
  .transform((raw) => {
    const value = raw?.trim().toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
  });

const configSchema = z.object({
  environment: z.string().min(1).default('development'),
  apiVersion: z.string().min(1).default('0.0.0'),
  corsOrigins: z
    .string()
    .default('http://localhost:3000')
    .transform((raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  demoMode: boolish,
  databaseUrl: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Validate the string vars of a binding object.
 *
 * Cheap enough to call per request (it is a handful of string checks) and that
 * keeps it correct when Cloudflare hands us a different `env` per isolate.
 */
export const appConfig = (env: Env): AppConfig =>
  configSchema.parse({
    environment: env.ENVIRONMENT,
    apiVersion: env.API_VERSION,
    corsOrigins: env.CORS_ORIGINS,
    demoMode: env.DEMO_MODE,
    databaseUrl: env.DATABASE_URL,
  });

/** Default acting role when the demo header is absent. Read-only, no cost access. */
export const DEFAULT_DEMO_ROLE: Role = 'sales';

/**
 * Default org for the demo, so a bare curl still returns data. Points at the
 * seeded organization so demo writes satisfy the `org_id` foreign keys.
 */
export const DEFAULT_DEMO_ORG = SEED_IDS.org;
