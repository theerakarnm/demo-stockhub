'use client';

/**
 * The one-click sample files of the guided walkthrough.
 *
 * The buttons fetch REAL files from /demo-files (apps/web/public) and hand
 * them to the page as ordinary picked files - the upload path, the adapter and
 * the preview are exactly the ones a manual upload takes, there is no fixture
 * built in memory. Each button also pins the channel: getChannelByKind picks
 * limit(1) without an order when the channel is omitted and the seed has two
 * channels per marketplace, so the walkthrough must not rely on detection.
 *
 * Rendered only while NEXT_PUBLIC_GUIDED_DEMO is on; with the flag off this
 * component renders nothing and there is no trace left.
 */

import { Button } from '@/components/ui';
import { GUIDED_DEMO } from '@/lib/config';
import { Sparkles } from 'lucide-react';

export interface SampleFileSpec {
  tourId: string;
  file: string;
  label: string;
  /** Seeded channel id - see TOUR_IDS in components/tour/tour-steps.ts. */
  channelId: string;
}

export const SAMPLE_FILES: readonly SampleFileSpec[] = [
  {
    tourId: 'sample-file-shopee-am',
    file: 'shopee-demo-2026-09-19-am.csv',
    label: 'Shopee (เช้า)',
    channelId: '0d000000-0000-4000-8000-000000000001',
  },
  {
    tourId: 'sample-file-shopee-pm',
    file: 'shopee-demo-2026-09-19-pm.csv',
    label: 'Shopee (บ่าย)',
    channelId: '0d000000-0000-4000-8000-000000000001',
  },
  {
    tourId: 'sample-file-lazada',
    file: 'lazada-demo-2026-09-19.csv',
    label: 'Lazada',
    channelId: '0d000000-0000-4000-8000-000000000003',
  },
  {
    tourId: 'sample-file-tiktok',
    file: 'tiktok-demo-2026-09-19.csv',
    label: 'TikTok Shop',
    channelId: '0d000000-0000-4000-8000-000000000006',
  },
];

export function SampleFileButtons({
  disabled = false,
  onPick,
}: {
  disabled?: boolean;
  onPick: (file: File, channelId: string) => void;
}) {
  if (!GUIDED_DEMO) return null;

  const pick = async (spec: SampleFileSpec) => {
    const response = await fetch(`/demo-files/${spec.file}`);
    if (!response.ok) return;
    const blob = await response.blob();
    onPick(new File([blob], spec.file, { type: 'text/csv' }), spec.channelId);
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
        <Sparkles className="size-3.5 text-emerald-600" aria-hidden />
        ใช้ไฟล์ตัวอย่าง (ช่องทางถูกเลือกให้อัตโนมัติ)
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SAMPLE_FILES.map((spec) => (
          <Button
            key={spec.tourId}
            variant="outline"
            size="sm"
            data-tour-id={spec.tourId}
            disabled={disabled}
            onClick={() => void pick(spec)}
          >
            {spec.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">หรือจะลากไฟล์ของร้านคุณเองเข้ามาก็ได้</p>
    </div>
  );
}
