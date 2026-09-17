/**
 * Hono generics for the whole app.
 *
 * Import `AppEnv` in every router and middleware so `c.env`, `c.get('auth')`
 * and `c.get('db')` are all typed. Never use `any` on a Hono context: the
 * cost-hiding rules depend on knowing the caller role at compile time.
 */

import type { OrgId, Permission, Role, UserId } from '@stockhub/core';
import type { Env } from '../env';
import type { DbAccessor } from '../lib/db';

/**
 * Who is calling. Produced by middleware/auth.ts.
 *
 * In demo mode it comes from request headers. With real auth it comes from a
 * verified session and NOTHING else in the codebase has to change.
 */
export interface AuthContext {
  orgId: OrgId;
  userId: UserId;
  role: Role;
  /** Derived from the role once, so handlers do not recompute it. */
  permissions: readonly Permission[];
  /** Display name for the demo header / audit trail. */
  displayName: string;
}

export interface AppVariables {
  auth: AuthContext;
  db: DbAccessor;
  requestId: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};
