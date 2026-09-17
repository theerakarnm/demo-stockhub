import { cn } from '@/lib/cn';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { fieldClass } from './input';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  options: SelectOption[];
  /** Adds a leading blank option, e.g. "ทุกช่องทาง". */
  placeholder?: string;
}

/** Native <select> on purpose: keyboard and mobile behaviour for free. */
export function Select({ label, options, placeholder, className, id, ...rest }: SelectProps) {
  const selectId = id ?? rest.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={selectId} className="mb-1 block text-xs font-medium text-slate-600">
          {label}
        </label>
      ) : null}
      <select id={selectId} className={cn(fieldClass(), 'pr-8', className)} {...rest}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
