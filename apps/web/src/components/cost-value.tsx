'use client';

/**
 * Cost masking.
 *
 * COSMETIC ONLY. The API is the real enforcement: stripCost() deletes the field
 * before the JSON leaves the server, so a role without `cost:read` receives
 * `undefined` here anyway. This component exists so the screen shows WHY the
 * number is missing instead of rendering an empty cell.
 *
 * Rule: every cost, COGS, margin and stock-value number in the UI goes through
 * <CostValue>. Search for "CostValue" to audit that in one grep.
 */

import { useRole } from '@/components/role-provider';
import { cn } from '@/lib/cn';
import { baht } from '@/lib/format';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';

export interface CostValueProps {
  /** Satang. `undefined` means the API stripped it for this role. */
  value?: number;
  /** Defaults to Thai baht formatting. */
  format?: (value: number) => string;
  /** Shown when the role MAY see costs but the value is genuinely missing. */
  fallback?: ReactNode;
  className?: string;
}

const MASK = '••••';

export function CostValue({ value, format = baht, fallback = '-', className }: CostValueProps) {
  const { canReadCost } = useRole();

  if (!canReadCost) {
    return (
      <span
        title="ต้องมีสิทธิ์ดูต้นทุน"
        aria-label="ต้องมีสิทธิ์ดูต้นทุน"
        className={cn('inline-flex items-center gap-1 text-slate-400 select-none', className)}
      >
        <Lock className="size-3" aria-hidden />
        <span className="tracking-widest">{MASK}</span>
      </span>
    );
  }

  if (value === undefined || value === null) {
    return <span className={cn('text-slate-400', className)}>{fallback}</span>;
  }

  return <span className={cn('tabular-nums', className)}>{format(value)}</span>;
}

export interface CostGateProps {
  children: ReactNode;
  /** Rendered instead of the children when the role lacks cost:read. */
  fallback?: ReactNode;
}

/**
 * Hides a whole block (a cost column, a margin card, the COGS report) rather
 * than masking a single number.
 */
export function CostGate({ children, fallback = null }: CostGateProps) {
  const { canReadCost } = useRole();
  return <>{canReadCost ? children : fallback}</>;
}

/** Inline explanation used at the bottom of cost-gated screens. */
export function CostLockedNote({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-slate-500', className)}>
      <Lock className="size-3" aria-hidden />
      ข้อมูลต้นทุนถูกซ่อนตามตำแหน่งงานของคุณ (ต้องมีสิทธิ์ cost:read)
    </p>
  );
}
