'use client';

/**
 * Customer picker for the bill screen.
 *
 * Search is debounced and answered by customersApi; picking a customer puts
 * the chip (name + tier) above the input so the cashier can see WHOSE price
 * the bill is using. "ลูกค้าทั่วไป" clears the pick: the bill then reprices
 * every line to the standard selling price.
 */

import { useDebouncedValue } from '@/components/inventory/use-debounced-value';
import { useRole } from '@/components/role-provider';
import { Button, SearchInput } from '@/components/ui';
import { customersApi } from '@/lib/api-pricing';
import type { CustomerView } from '@/lib/api-types-pricing';
import { useApi } from '@/lib/use-api';
import { UserX } from 'lucide-react';
import { useState } from 'react';

export interface CustomerPickerProps {
  customer: CustomerView | null;
  onPick: (customer: CustomerView | null) => void;
}

export function CustomerPicker({ customer, onPick }: CustomerPickerProps) {
  const { role } = useRole();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const { data, error, loading } = useApi(() => customersApi.list(q), [q, role]);

  // Dormant customers stay listed for history but are not billable.
  const matches = (data ?? []).filter((candidate) => candidate.isActive);
  const tierOf = (candidate: CustomerView): string => candidate.priceTierName ?? 'ปลีก (ค่าเริ่มต้น)';

  const pick = (candidate: CustomerView) => {
    onPick(candidate);
    setSearch('');
  };

  return (
    <div className="space-y-2">
      {customer ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
            <span className="font-medium">{customer.name}</span>
            <span className="text-xs text-emerald-600">{tierOf(customer)}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => onPick(null)}>
            <UserX className="size-4" aria-hidden />
            ลูกค้าทั่วไป
          </Button>
        </div>
      ) : null}

      <SearchInput
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="ค้นหาลูกค้าเพื่อใช้ราคาตามระดับ"
        aria-label="ค้นหาลูกค้า"
      />

      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error.message}
        </p>
      ) : null}

      {search.trim().length > 0 ? (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
          {loading && matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">กำลังค้นหา...</p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">ไม่พบลูกค้า</p>
          ) : (
            matches.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                onClick={() => pick(candidate)}
              >
                <span className="font-medium text-slate-900">{candidate.name}</span>
                <span className="text-xs text-slate-500">
                  {candidate.phone ? `${candidate.phone} - ` : ''}
                  {tierOf(candidate)}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
