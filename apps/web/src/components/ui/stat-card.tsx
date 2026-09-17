import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';
import { Skeleton } from './skeleton';

export type StatTone = 'default' | 'positive' | 'warning' | 'danger';

const TONE_VALUE: Record<StatTone, string> = {
  default: 'text-slate-900',
  positive: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
};

const TONE_ICON: Record<StatTone, string> = {
  default: 'bg-slate-100 text-slate-500',
  positive: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600',
};

export interface StatCardProps {
  label: string;
  /** Pass a <CostValue> here for cost-gated numbers. */
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  loading?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  loading = false,
  className,
}: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon ? (
          <span
            className={cn('flex size-8 items-center justify-center rounded-lg', TONE_ICON[tone])}
          >
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-28" />
      ) : (
        <p className={cn('mt-2 text-2xl font-semibold tabular-nums', TONE_VALUE[tone])}>{value}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
