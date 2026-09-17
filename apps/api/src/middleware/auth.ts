/**
 * DEMO AUTH ONLY.
 *
 * The pre-sales demo needs one thing: switch job position in the header and
 * watch cost data disappear. So the acting role arrives in a request header:
 *
 *   x-demo-role: owner | manager | stock_staff | sales
 *   x-demo-org:  <orgId>
 *   x-demo-user: <userId>   (optional, defaults to a per-role demo user)
 *
 * REPLACING THIS WITH REAL AUTH
 * Swap the body of `authMiddleware` for session/JWT verification and keep
 * setting the same `AuthContext`. Nothing else in the API changes: routes read
 * `c.get('auth')`, permissions come from `permissionsOf(role)`, and cost hiding
 * happens in lib/response.ts. Do not scatter role checks into handlers.
 *
 * Safety net: when DEMO_MODE is not 'true' the header is ignored and the request
 * is rejected, so a production deploy cannot be impersonated by a curl header.
 */

import { ROLES, type Role, StockHubError, asOrgId, asUserId, permissionsOf } from '@stockhub/core';
import { createMiddleware } from 'hono/factory';
import { DEFAULT_DEMO_ORG, DEFAULT_DEMO_ROLE, appConfig } from '../env';
import type { AppEnv, AuthContext } from '../types/app';

export const DEMO_ROLE_HEADER = 'x-demo-role';
export const DEMO_ORG_HEADER = 'x-demo-org';
export const DEMO_USER_HEADER = 'x-demo-user';

const isRole = (value: string | undefined): value is Role =>
  value !== undefined && (ROLES as readonly string[]).includes(value);

/** Friendly names so the audit trail in the demo is readable. */
const DEMO_USER_NAMES: Record<Role, string> = {
  owner: 'คุณเจ้าของร้าน (demo)',
  manager: 'คุณผู้จัดการ (demo)',
  stock_staff: 'พนักงานคลัง (demo)',
  sales: 'พนักงานขาย (demo)',
};

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const config = appConfig(c.env);

  if (!config.demoMode) {
    // Fail closed. Implement real auth before turning DEMO_MODE off.
    throw new StockHubError('forbidden', 'Demo auth is disabled and real auth is not wired yet');
  }

  const rawRole = c.req.header(DEMO_ROLE_HEADER)?.trim().toLowerCase();
  if (rawRole !== undefined && !isRole(rawRole)) {
    throw new StockHubError('validation_error', `Unknown ${DEMO_ROLE_HEADER}: "${rawRole}"`, {
      allowed: ROLES,
    });
  }

  const role: Role = isRole(rawRole) ? rawRole : DEFAULT_DEMO_ROLE;
  const orgId = c.req.header(DEMO_ORG_HEADER)?.trim() || DEFAULT_DEMO_ORG;
  const userId = c.req.header(DEMO_USER_HEADER)?.trim() || `user_demo_${role}`;

  const auth: AuthContext = {
    orgId: asOrgId(orgId),
    userId: asUserId(userId),
    role,
    permissions: permissionsOf(role),
    displayName: DEMO_USER_NAMES[role],
  };

  c.set('auth', auth);
  await next();
});
