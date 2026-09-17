'use client';

import { useRole } from '@/components/role-provider';
import { RoleSwitcher } from '@/components/role-switcher';
import { DEMO_MODE } from '@/lib/config';
import { Building2 } from 'lucide-react';

/** Top bar: org name on the left, demo role switcher on the right. */
export function Topbar() {
  const { orgName } = useRole();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Building2 className="size-4 shrink-0 text-slate-400" aria-hidden />
        <span className="truncate text-sm font-medium text-slate-800">{orgName}</span>
        {DEMO_MODE ? (
          <span className="ml-1 hidden rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 ring-inset sm:inline">
            โหมดสาธิต (ข้อมูลตัวอย่าง)
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <RoleSwitcher />
      </div>
    </header>
  );
}
