'use client';

/**
 * Role context - the headline feature of the demo.
 *
 * The chosen job position is kept here, mirrored into localStorage (so a page
 * reload keeps it) and pushed into src/lib/demo-identity.ts, which is what
 * api-client.ts reads when it sets the `x-demo-role` header.
 *
 * The permission answers come from can() / permissionsOf() in @stockhub/core.
 * The client never invents its own rules: one rule table, used by the UI and by
 * the API.
 *
 * REAL AUTH: replace `setRole` with a no-op (or an admin-only impersonation
 * feature) and hydrate `role` from the session. Everything else stays.
 */

import { DEMO_ORG_ID, DEMO_ORG_NAME } from '@/lib/config';
import { DEFAULT_ROLE, ROLE_STORAGE_KEY, setDemoIdentity } from '@/lib/demo-identity';
import type { Permission, Role } from '@stockhub/core';
import { ROLES, can, permissionsOf } from '@stockhub/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
  permissions: readonly Permission[];
  /** `hasPermission('cost:read')` - thin wrapper over can() for readability. */
  hasPermission: (permission: Permission) => boolean;
  /** Shortcut used by <CostValue> and every cost column. */
  canReadCost: boolean;
  orgId: string;
  orgName: string;
  /** False during the first client render, before localStorage is read. */
  hydrated: boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>(DEFAULT_ROLE);
  const [hydrated, setHydrated] = useState(false);

  // Read the stored role after mount. Reading localStorage during render would
  // break the server/client markup match.
  useEffect(() => {
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (isRole(stored)) {
      setRoleState(stored);
      setDemoIdentity({ role: stored, userId: `user_demo_${stored}` });
    }
    setHydrated(true);
  }, []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    setDemoIdentity({ role: next, userId: `user_demo_${next}` });
    window.localStorage.setItem(ROLE_STORAGE_KEY, next);
  }, []);

  const value = useMemo<RoleContextValue>(() => {
    const permissions = permissionsOf(role);
    return {
      role,
      setRole,
      permissions,
      hasPermission: (permission: Permission) => can(role, permission),
      canReadCost: can(role, 'cost:read'),
      orgId: DEMO_ORG_ID,
      orgName: DEMO_ORG_NAME,
      hydrated,
    };
  }, [role, setRole, hydrated]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used inside <RoleProvider>');
  return context;
}
