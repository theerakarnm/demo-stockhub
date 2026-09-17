/**
 * Who am I. The web app calls this once to render the role switcher and to
 * decide which UI a role may see (the API still enforces it on every call).
 */

import { Hono } from 'hono';
import { ok } from '../lib/response';
import type { AppEnv } from '../types/app';
import type { MeResponse } from '../types/contract';

export const meRouter = new Hono<AppEnv>().get('/', (c) => {
  const auth = c.get('auth');
  const body: MeResponse = {
    user: { id: auth.userId, name: auth.displayName, orgId: auth.orgId },
    role: auth.role,
    // Sent so the UI can hide a button it is not allowed to use. Never the
    // only check: the matching route has requirePermission() as well.
    permissions: [...auth.permissions],
  };
  return ok(c, body);
});
