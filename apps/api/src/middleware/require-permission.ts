/**
 * Route level permission guard.
 *
 * Usage:
 *   reports.get('/cogs', requirePermission('report:read', 'cost:read'), handler)
 *
 * This guard is about ACCESS (can you call this endpoint at all). Hiding cost
 * FIELDS inside an allowed response is a different job, done once in
 * lib/response.ts. Keep the two separate: a `sales` user may read an order but
 * must not read its COGS, which is field stripping, not a 403.
 */

import { ForbiddenError, type Permission, can } from '@stockhub/core';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/app';

/** Every listed permission must be held (AND, not OR). */
export const requirePermission = (...required: [Permission, ...Permission[]]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const { role } = c.get('auth');
    const missing = required.find((permission) => !can(role, permission));
    if (missing) throw new ForbiddenError(missing);
    await next();
  });
