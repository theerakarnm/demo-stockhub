'use client';

/**
 * Permission-based rendering gate.
 *
 * COSMETIC ONLY, exactly like the cost mask: the API redacts every response by
 * role, so a role without the permission never receives the data in the first
 * place. The gate exists so the screen shows a deliberate fallback instead of
 * a broken or mysteriously empty block.
 *
 * Rule: gate a whole block (a column, a card, a report) with <PermissionGate>,
 * gate a single money value with <CostValue>. One policy table in
 * @stockhub/core drives both sides, so the UI cannot invent its own rules.
 */

import { useRole } from '@/components/role-provider';
import { isVisible } from '@/lib/permissions';
import type { Permission } from '@stockhub/core';
import type { ReactNode } from 'react';

// Re-exported so the helper and the gate built on it travel together: call
// sites can import either one from this module.
export { isVisible };

export interface PermissionGateProps {
  /** The permission that unlocks the children, e.g. 'cost:read'. */
  permission: Permission;
  children: ReactNode;
  /** Rendered instead of the children when the role lacks the permission. */
  fallback?: ReactNode;
}

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { role } = useRole();
  return <>{isVisible(role, permission) ? children : fallback}</>;
}
