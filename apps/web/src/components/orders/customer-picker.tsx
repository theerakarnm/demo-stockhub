'use client';

/**
 * Customer picker for the bill screen.
 *
 * Search runs on the customers API with a deferred value (one request per
 * pause in typing). Picking a customer collapses the search into a chip so the
 * cashier always sees who the bill is for; "ลูกค้าทั่วไป" is the explicit
 * walk-in choice and clears any pick.
 */

import { useRole } from '@/components/role-provider';
import { SearchInput } from '@/components/ui';
import { customersApi } from '@/lib/api-pricing';
import type { CustomerView } from '@/lib/api-types-pricing';
import { useApi } from '@/lib/use-api';
import { Tags, UserRound, X } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

interface CustomerPickerProps {
  customer: CustomerView | null;
  onPick: (customer: CustomerView) => void;
  onClear: () => void;
}

export function CustomerPicker({ customer, onPick, onClear }: CustomerPickerProps) {
  const { role } = useRole();
  const [q, setQ] = useState('');
  const deferredQ = useDeferredValue(q);

  // Skip the request entirely once a customer is picked - the search is only
  // for finding the next one.
  const { data, loading } = useApi(
    () => (customer ? Promise.resolve([]) : customersApi.list(deferredQ)),
    [deferredQ, role, customer],
  );

  const results = (data ?? []).slice(0, 5);

  if (customer) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 py-1 pl-2 pr-3 text-sm text-emerald-800">
          <UserRound className="size-4 text-emerald-600" aria-hidden />
          <span className="font-medium">{customer.name}</span>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700/80">
            <Tags className="size-3.5" aria-hidden />
            {customer.priceTierName ?? 'ปลีก (ค่าเริ่มต้น)'}
          </span>
          <button
            type="button"
            onClick={onClear}
            aria-label="ยกเลิกลูกค้าที่เลือก"
            className="rounded-full p-0.5 text-emerald-600 hover:bg-emerald-100"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          ลูกค้าทั่วไป
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SearchInput
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="ค้นหาลูกค้า (ชื่อหรือเบอร์โทร)"
        aria-label="ค้นหาลูกค้า"
      />
      {loading && deferredQ !== '' ? <p className="text-xs text-slate-400">กำลังค้นหา...</p> : null}
      {results.length > 0 ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {results.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => onPick(candidate)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{candidate.name}</span>
                <span className="text-xs text-slate-500">
                  {candidate.phone ?? ''} {candidate.priceTierName ?? ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-slate-500 hover:text-slate-800"
      >
        ลูกค้าทั่วไป
      </button>
    </div>
  );
}
