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

/**
 * In-memory R2-shaped bucket for import tests.
 *
 * It satisfies the subset of the R2Bucket interface createR2Storage() uses
 * (put / get / head / delete), so the production storage adapter runs unmodified
 * and the tests exercise the real put-before-parse ordering and key layout.
 * Objects live for the lifetime of the bucket instance; assign a fresh one to
 * `testEnv.IMPORTS_BUCKET` in a test file that needs a clean bucket.
 */
export class MemoryR2Bucket {
  private readonly objects = new Map<
    string,
    { body: Uint8Array; contentType: string; uploadedAt: Date }
  >();

  async put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{
    key: string;
    size: number;
    httpMetadata: { contentType: string };
    uploaded: Date;
  }> {
    const body = value.slice();
    const contentType = options?.httpMetadata?.contentType ?? 'application/octet-stream';
    this.objects.set(key, { body, contentType, uploadedAt: new Date() });
    return { key, size: body.byteLength, httpMetadata: { contentType }, uploaded: new Date() };
  }

  async get(key: string): Promise<{
    key: string;
    size: number;
    httpMetadata: { contentType: string };
    uploaded: Date;
    arrayBuffer: () => Promise<ArrayBuffer>;
  } | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      key,
      size: stored.body.byteLength,
      httpMetadata: { contentType: stored.contentType },
      uploaded: stored.uploadedAt,
      arrayBuffer: async () => stored.body.slice().buffer,
    };
  }

  async head(key: string): Promise<{
    key: string;
    size: number;
    httpMetadata: { contentType: string };
    uploaded: Date;
  } | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      key,
      size: stored.body.byteLength,
      httpMetadata: { contentType: stored.contentType },
      uploaded: stored.uploadedAt,
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  /** Test assertion helper: the exact bytes stored under a key. */
  bytesOf(key: string): Uint8Array | undefined {
    return this.objects.get(key)?.body;
  }
}

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
  // Per-call override. `testEnv` is a module singleton shared by every suite,
  // so a test that needs different bindings (a second database, another
  // ENVIRONMENT) must pass its own copy instead of mutating the shared one.
  env: Env = testEnv,
): Promise<Response> => {
  const headers: Record<string, string> = {
    ...asRole(role).headers,
    ...Object.fromEntries(new Headers(init?.headers)),
  };
  return app.request(path, { ...init, headers }, env);
};

/** requestAs, but returns the parsed JSON body typed by the caller. */
export const jsonAs = async <T>(
  app: Hono<AppEnv>,
  path: string,
  role: Role,
  init?: RequestInit,
  env: Env = testEnv,
): Promise<T> => {
  const res = await requestAs(app, path, role, init, env);
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
