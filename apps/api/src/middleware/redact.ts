/**
 * Role-aware redaction of every JSON response under /api/v1.
 *
 * Mounted on v1 before every route so responses are rewritten after `next()`
 * in one place. Role-aware redaction must not be scattered into handlers; this
 * is the single seam where that policy lands, and it wraps whatever the handler
 * produced - `ok()`, `paginated()` or a raw `c.json()`.
 */

import { redactForRole } from '@stockhub/core';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/app';

export const redactMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  const res = c.res;
  if (!res.headers.get('content-type')?.includes('application/json')) return;
  const auth = c.get('auth');
  if (!auth || res.status >= 400) return; // error envelopes carry no business fields
  const body: unknown = await res.clone().json();
  const redacted = redactForRole(auth.role, body);
  // The old body's content-length is now wrong; drop it or the client reads a
  // truncated body, and let the runtime recompute it from the new body.
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  c.res = new Response(JSON.stringify(redacted), { status: res.status, headers });
});
