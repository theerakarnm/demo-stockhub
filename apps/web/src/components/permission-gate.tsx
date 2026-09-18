'use client';

/**
 * Permission gate for whole UI blocks.
 *
 * COSMETIC ONLY, exactly like the cost mask in <CostValue>: the API redacts
 * every response by role before it leaves the server, so a role without the
 * permission never receives the data in the first place. This gate exists so a
 * screen hides the control (a button, a column, a whole card) instead of
 * rendering something the role cannot use.
 *
 * Rule: one gate per permission, named explicitly at the call site - grep for
 * "<PermissionGate" to audit which UI blocks depend on which permission.
 */

import type { Permission, Role } from '@stockhub/core';
import { can } from '@stockhub/core';
import type { ReactNode } from 'react';
// Relative, not the usual '@/' alias: bun test runs from the monorepo root,
// where apps/web's tsconfig paths are invisible, so only relative imports keep
// this component testable without a bundler.
import { useRole } from './role-provider';

/** Pure predicate so tests and non-React code ask the exact same question. */
export const isVisible = (role: Role, permission: Permission): boolean => can(role, permission);

export interface PermissionGateProps {
  /** The permission the current role must hold to see the children. */
  permission: Permission;
  children: ReactNode;
  /** Rendered instead of the children when the role lacks the permission. */
  fallback?: ReactNode;
}

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { hasPermission } = useRole();
  return <>{hasPermission(permission) ? children : fallback}</>;
}
