/**
 * Cost redaction hook - a pass-through until Task 37 (Track E) fills it in.
 *
 * Mounted on v1 before every route so responses can be rewritten after
 * `next()` in one place. Role-aware redaction must not be scattered into
 * handlers; this is the single seam where that policy lands.
 */

import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/app';

export const redactMiddleware = createMiddleware<AppEnv>(async (_c, next) => {
  await next();
});
