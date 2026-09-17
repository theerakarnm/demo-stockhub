'use client';

/**
 * POS vs wholesale switch. Two pressed-state buttons instead of a <Select>,
 * because a cashier taps this on a touch screen all day.
 */

import { cn } from '@/lib/cn';
import { Store, Truck } from 'lucide-react';

/** Only these two kinds can be created by hand; marketplaces arrive by import. */
export type ManualChannelKind = 'pos' | 'wholesale';

const OPTIONS: Array<{ kind: ManualChannelKind; label: string; hint: string }> = [
  { kind: 'pos', label: 'หน้าร้าน (POS)', hint: 'ขายปลีกหน้าเคาน์เตอร์' },
  { kind: 'wholesale', label: 'ขายส่ง', hint: 'ลูกค้าร้านค้า ราคาส่ง' },
];

const ICONS: Record<ManualChannelKind, typeof Store> = {
  pos: Store,
  wholesale: Truck,
};

interface ChannelKindToggleProps {
  value: ManualChannelKind;
  onChange: (kind: ManualChannelKind) => void;
}

export function ChannelKindToggle({ value, onChange }: ChannelKindToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {OPTIONS.map((option) => {
        const Icon = ICONS[option.kind];
        const active = value === option.kind;
        return (
          <button
            key={option.kind}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.kind)}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
              active
                ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                : 'border-slate-300 bg-white hover:bg-slate-50',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500',
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900">{option.label}</span>
              <span className="block text-xs text-slate-500">{option.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
