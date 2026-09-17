/**
 * Dense admin table primitives. Plain elements with house styling - no
 * data-grid dependency, because every screen needs a different cell renderer.
 *
 * Numeric columns: add `numeric` to <Th> and <Td> so figures line up.
 */

import { cn } from '@/lib/cn';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function TableWrap({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...rest} />;
}

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...rest} />;
}

export function Thead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-slate-50', className)} {...rest} />;
}

export function Tbody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-slate-100', className)} {...rest} />;
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Adds hover + pointer styling for clickable rows. */
  clickable?: boolean;
  /** Amber tint, used for the low-stock highlight. */
  highlight?: boolean;
}

export function Tr({ clickable, highlight, className, ...rest }: TrProps) {
  return (
    <tr
      className={cn(
        clickable && 'cursor-pointer hover:bg-slate-50',
        highlight && 'bg-amber-50/70 hover:bg-amber-100/70',
        className,
      )}
      {...rest}
    />
  );
}

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function Th({ numeric, className, ...rest }: ThProps) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...rest}
    />
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function Td({ numeric, className, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle text-slate-700',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...rest}
    />
  );
}
