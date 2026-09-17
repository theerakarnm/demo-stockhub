'use client';

/**
 * Numbered flow used by /imports/new. The upload screen is the pitch, so the
 * user must always see where they are and what is left to do.
 */

import { cn } from '@/lib/cn';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

export interface ImportStep {
  /** 1-based, matches the number printed in the circle. */
  id: number;
  title: string;
  hint?: string;
}

export function ImportStepper({ steps, current }: { steps: ImportStep[]; current: number }) {
  return (
    <ol className="mb-5 flex flex-wrap items-stretch gap-2">
      {steps.map((step) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <li
            key={step.id}
            className={cn(
              'flex min-w-[10rem] flex-1 items-center gap-3 rounded-xl border px-3 py-2.5',
              done && 'border-emerald-200 bg-emerald-50/70',
              active && 'border-emerald-500 bg-white shadow-sm',
              !done && !active && 'border-slate-200 bg-white/60',
            )}
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done && 'bg-emerald-600 text-white',
                active && 'bg-emerald-600 text-white',
                !done && !active && 'bg-slate-100 text-slate-500',
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : step.id}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-sm font-medium',
                  active || done ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                {step.title}
              </span>
              {step.hint ? <span className="block text-xs text-slate-500">{step.hint}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface StepPanelProps {
  step: number;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Dimmed until the flow reaches this step, so the eye goes to the active card. */
  muted?: boolean;
  children: ReactNode;
}

/** A card that carries its step number, used for each block of the upload flow. */
export function StepPanel({ step, title, description, action, muted, children }: StepPanelProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm transition-opacity',
        muted && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {step}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
