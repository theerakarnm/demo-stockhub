'use client';

/**
 * The walkthrough's one-click reset (scene 20).
 *
 * Confirms once, calls POST /demo/reset, rewinds the tour state and reloads
 * the page. The reload is not cosmetic: use-api has no global cache invalidation
 * and the panel lives in layout.tsx, so every page's useApi would otherwise
 * keep showing pre-reset numbers.
 *
 * The endpoint 404s outside ENVIRONMENT=development - see demo-service.ts.
 */

import { Button } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useState } from 'react';

export function ResetDemoButton({ onReset }: { onReset: () => void }) {
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    if (!window.confirm('ล้างข้อมูลที่สร้างระหว่าง Demo ทั้งหมด แล้วกลับไปจุดเริ่มต้น ใช้เวลาไม่กี่วินาที')) {
      return;
    }
    setBusy(true);
    try {
      await api.resetDemo();
      onReset();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour-id="reset-demo-button"
      disabled={busy}
      onClick={() => void reset()}
      className="text-red-700 hover:bg-red-50"
    >
      รีเซ็ต Demo
    </Button>
  );
}
