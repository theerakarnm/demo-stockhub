'use client';

/**
 * Demo role switcher.
 *
 * Changing the job position here changes: the `x-demo-role` header on every
 * request, the permission answers from can(), and therefore every cost number
 * on the screen. It is the 30 second version of the whole RBAC story.
 *
 * Labels come from ROLE_LABELS in @stockhub/core so the UI cannot drift from
 * the domain layer.
 */

import { useRole } from '@/components/role-provider';
import { cn } from '@/lib/cn';
import { ROLES, ROLE_LABELS, can, permissionsOf } from '@stockhub/core';
import type { Role } from '@stockhub/core';
import { Check, ChevronDown, Eye, Lock, UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';

const PANEL_ID = 'role-switcher-panel';

export function RoleSwitcher() {
  const { role, setRole, hydrated } = useRole();
  const [open, setOpen] = useState(false);

  const choose = (next: Role) => {
    setRole(next);
    setOpen(false);
  };

  // Escape closes the panel. The click-away layer only helps a mouse user.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        data-tour-id="role-switcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
      >
        <UserCog className="size-4 text-slate-500" aria-hidden />
        <span className="hidden font-medium sm:inline">
          {/* Before hydration the stored role is unknown; show a stable label. */}
          {hydrated ? ROLE_LABELS[role].th : 'ตำแหน่งงาน'}
        </span>
        <ChevronDown className="size-4 text-slate-400" aria-hidden />
      </button>

      {open ? (
        <>
          {/* Click-away layer. */}
          <button
            type="button"
            aria-label="ปิดเมนู"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          {/*
            Disclosure panel, not a listbox. A real listbox owes the user arrow
            key navigation and typeahead; this is a short list of buttons, so it
            claims only what it actually implements.
          */}
          <div
            id={PANEL_ID}
            className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold text-slate-900">สลับตำแหน่งงาน (เดโม)</p>
              <p className="mt-0.5 text-[11px] text-slate-500">สิทธิ์การเห็นต้นทุนจะเปลี่ยนทันที</p>
            </div>
            <ul>
              {ROLES.map((value) => {
                const costVisible = can(value, 'cost:read');
                const selected = value === role;
                return (
                  <li key={value}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => choose(value)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50',
                        selected && 'bg-emerald-50/60',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">
                          {ROLE_LABELS[value].th}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {ROLE_LABELS[value].en} / {permissionsOf(value).length} สิทธิ์
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {costVisible ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-600"
                            title="เห็นข้อมูลต้นทุน"
                          >
                            <Eye className="size-3" aria-hidden />
                            ต้นทุน
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400"
                            title="ไม่เห็นข้อมูลต้นทุน"
                          >
                            <Lock className="size-3" aria-hidden />
                            ต้นทุน
                          </span>
                        )}
                        {selected ? (
                          <Check className="size-4 text-emerald-600" aria-hidden />
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
