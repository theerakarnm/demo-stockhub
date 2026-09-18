/**
 * Shared seam for API route tests.
 *
 * Every parallel track writes tests against the same helpers: build an app
 * with `buildTestApp`, call it through `requestAs` / `jsonAs` with a role, and
 * read the JSON back typed. Keeping the fake bindings and the demo headers in
 * one place means a change to the env shape or auth is a one-file fix.
 */

import type { Role } from '@stockhub/core';
import { SEED_IDS } from '@stockhub/db';
import { Hono } from 'hono';
import type { Env } from './env';
import { authMiddleware } from './middleware/auth';
import { dbMiddleware } from './middleware/db';
import { errorHandler, notFoundHandler } from './middleware/error';
import { redactMiddleware } from './middleware/redact';
import { requestIdMiddleware } from './middleware/request-id';
import type { AppEnv } from './types/app';

/** Fake bindings. R2 is never touched by a test route, hence the cast. */
export const testEnv: Env = {
  ENVIRONMENT: 'test',
  API_VERSION: '0.0.0-test',
  CORS_ORIGINS: 'http://localhost:3000',
  DEMO_MODE: 'true',
  DATABASE_URL: process.env.DATABASE_URL,
  IMPORTS_BUCKET: undefined as unknown as R2Bucket,
};

/** Demo auth headers for a role, with the org pointing at the seeded one. */
export const asRole = (role: Role): { headers: Record<string, string> } => ({
  headers: { 'x-demo-role': role, 'x-demo-org': SEED_IDS.org },
});

/** `app.request` with the role headers applied; explicit init headers win. */
export const requestAs = async (
  app: Hono<AppEnv>,
  path: string,
  role: Role,
  init?: RequestInit,
): Promise<Response> => {
  const headers: Record<string, string> = {
    ...asRole(role).headers,
    ...Object.fromEntries(new Headers(init?.headers)),
  };
  return app.request(path, { ...init, headers }, testEnv);
};

/** requestAs, but returns the parsed JSON body typed by the caller. */
export const jsonAs = async <T>(
  app: Hono<AppEnv>,
  path: string,
  role: Role,
  init?: RequestInit,
): Promise<T> => {
  const res = await requestAs(app, path, role, init);
  return (await res.json()) as T;
};

/**
 * Build an app under test wired exactly like src/index.ts: requestId on the
 * outer app, auth + db + redact on v1, one error envelope for every failure.
 * The `mount` callback adds routes, so each track's tests mount only their
 * own router and never the whole app.
 */
export const buildTestApp = (mount: (v1: Hono<AppEnv>) => Hono<AppEnv>): Hono<AppEnv> => {
  const v1 = mount(
    new Hono<AppEnv>().use('*', authMiddleware).use('*', dbMiddleware).use('*', redactMiddleware),
  );
  const app = new Hono<AppEnv>();
  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.route('/api/v1', v1);
  return app;
};
