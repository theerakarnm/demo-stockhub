/**
 * Automatic response redaction.
 *
 * Mounted on v1 around every route, this rewrites each JSON response with
 * redactForRole() after the handler has run, whether the handler answered
 * through ok(), paginated() or a raw c.json(). A new route is therefore
 * filtered without writing a line of permission code: registering a key in
 * FIELD_POLICIES is the whole work.
 *
 * The handler-level ok() keeps stripping too. Both layers read the same policy
 * table in packages/core/src/rbac.ts, so they cannot disagree, and running the
 * payload twice is idempotent.
 *
 * Gotcha: replacing c.res must drop the stale content-length header, or the
 * client reads a truncated body. Copy the headers, delete that one, and let
 * the runtime recompute it.
 */

import { redactForRole } from '@stockhub/core';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/app';

export const redactMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  const res = c.res;
  if (!res.headers.get('content-type')?.includes('application/json')) return;
  const auth = c.get('auth');
  // Error envelopes carry no business fields, and no auth means the request
  // never reached a business route, so there is nothing to redact against.
  if (!auth || res.status >= 400) return;
  const body: unknown = await res.clone().json();
  const redacted = redactForRole(auth.role, body);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  c.res = new Response(JSON.stringify(redacted), { status: res.status, headers });
});
