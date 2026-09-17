/**
 * The demo "session".
 *
 * There is no login in the demo. The role switcher writes the chosen job
 * position here, api-client.ts turns it into the `x-demo-role` / `x-demo-org`
 * headers, and the API middleware turns those headers back into an AuthContext.
 *
 * REPLACING THIS WITH REAL AUTH: delete this module, read the session from your
 * auth provider inside api-client.ts, and drop the two demo headers. Nothing
 * else in the UI reads the identity directly.
 */

import type { Role } from '@stockhub/core';
import { DEMO_ORG_ID } from './config';

export interface DemoIdentity {
  orgId: string;
  userId: string;
  role: Role;
}

export const DEFAULT_ROLE: Role = 'owner';

export const ROLE_STORAGE_KEY = 'stockhub.demo.role';

let current: DemoIdentity = {
  orgId: DEMO_ORG_ID,
  userId: 'user_demo_owner',
  role: DEFAULT_ROLE,
};

export const getDemoIdentity = (): DemoIdentity => current;

/** Called by RoleProvider on mount and on every role change. */
export const setDemoIdentity = (next: Partial<DemoIdentity>): DemoIdentity => {
  current = { ...current, ...next };
  return current;
};
