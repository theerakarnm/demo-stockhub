/**
 * Request id for log correlation.
 *
 * Reuses an inbound `x-request-id` (or Cloudflare's `cf-ray`) so one id follows
 * a call across web -> API -> logs, and echoes it back on the response.
 */

import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/app';

export const requestIdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header('x-request-id') ?? c.req.header('cf-ray');
  const requestId = incoming ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
});
