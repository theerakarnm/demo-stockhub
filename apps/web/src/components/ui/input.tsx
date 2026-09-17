import { cn } from '@/lib/cn';
import { Search } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export const fieldClass = (className?: string): string =>
  cn(
    'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900',
    'placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
    className,
  );

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Rendered above the field. Keep it short - this is a dense admin UI. */
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export function Input({ label, hint, error, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-slate-600">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={fieldClass(cn(error && 'border-rose-400 focus:border-rose-500', className))}
        {...rest}
      />
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Search box with a magnifier. Used by the inventory and product pickers. */
export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input type="search" className={fieldClass(cn('pl-8', className))} {...rest} />
    </div>
  );
}
