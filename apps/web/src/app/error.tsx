'use client';

/**
 * Route-level error boundary. Catches render-time crashes, not API errors -
 * those are handled per screen with <ErrorState>.
 */

import { Button } from '@/components/ui';
import { AlertOctagon } from 'lucide-react';
import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Swap for your telemetry client when one exists.
    console.error('[stockhub] unhandled UI error', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <AlertOctagon className="size-6" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">เกิดข้อผิดพลาดในหน้านี้</h1>
      <p className="mt-1 max-w-md text-sm text-slate-500">{error.message}</p>
      {error.digest ? (
        <p className="mt-1 font-mono text-[11px] text-slate-400">digest: {error.digest}</p>
      ) : null}
      <Button className="mt-5" onClick={reset}>
        ลองใหม่อีกครั้ง
      </Button>
    </div>
  );
}
