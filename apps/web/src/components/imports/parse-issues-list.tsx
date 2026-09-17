/**
 * Parse issues from the adapter. An adapter never throws on a bad row, it
 * reports it here, so this list is how the shop finds the broken line.
 */

import { EmptyState } from '@/components/ui';
import type { ParseIssue } from '@/lib/api-types';
import { cn } from '@/lib/cn';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function ParseIssuesList({ issues }: { issues: ParseIssue[] }) {
  if (issues.length === 0) {
    return (
      <EmptyState
        title="ไม่พบปัญหาในไฟล์นี้"
        description="ทุกแถวอ่านได้ครบ ไม่มีแถวที่ถูกข้ามหรือค่าที่อ่านไม่ออก"
        icon={<CheckCircle2 className="size-5 text-emerald-500" aria-hidden />}
      />
    );
  }

  // Keys built outside JSX: two rows can share a code and a file-level issue
  // has no row number at all.
  const rows = issues.map((issue, index) => ({
    key: `${issue.code}-${issue.row ?? index}`,
    issue,
  }));

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map(({ key, issue }) => {
        const isError = issue.severity === 'error';
        return (
          <li key={key} className="flex items-start gap-3 px-4 py-2.5">
            {isError ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            )}
            <div className="min-w-0">
              <p className={cn('text-sm', isError ? 'text-rose-700' : 'text-slate-700')}>
                {issue.message}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {issue.row !== undefined ? `แถวที่ ${issue.row}` : 'ทั้งไฟล์'}
                {issue.column ? ` / คอลัมน์ ${issue.column}` : ''}
                <span className="ml-2 font-mono text-[11px] text-slate-400">{issue.code}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
