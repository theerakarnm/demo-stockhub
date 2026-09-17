'use client';

import type { ApiError } from '@/lib/api-error';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

export interface ErrorStateProps {
  error: ApiError;
  onRetry?: () => void;
}

/**
 * One place that turns an ApiError into screen copy. Template gaps (HTTP 501)
 * must read as "not built yet", not as a crash - the demo shows them on purpose.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const notImplemented = error.code === 'not_implemented';
  const title = notImplemented
    ? 'ส่วนนี้ยังไม่ถูกพัฒนา'
    : error.code === 'forbidden'
      ? 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้'
      : 'โหลดข้อมูลไม่สำเร็จ';

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className={`mb-3 flex size-11 items-center justify-center rounded-full ${
          notImplemented ? 'bg-slate-100 text-slate-400' : 'bg-rose-50 text-rose-500'
        }`}
      >
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 max-w-md text-xs text-slate-500">{error.message}</p>
      <p className="mt-1 font-mono text-[11px] text-slate-400">
        code: {error.code}
        {error.status ? ` / HTTP ${error.status}` : ''}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden />
          ลองใหม่
        </Button>
      ) : null}
    </div>
  );
}
