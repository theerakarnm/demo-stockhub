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
 * The four buttons are written out literally (not mapped) so each data-tour-id
 * is greppable - tour-targets.test.ts holds this file to that contract.
 *
 * Rendered only while NEXT_PUBLIC_GUIDED_DEMO is on; with the flag off this
 * component renders nothing and there is no trace left.
 */

import { Button } from '@/components/ui';
import { GUIDED_DEMO } from '@/lib/config';
import { Sparkles } from 'lucide-react';

interface SampleSpec {
  tourId: string;
  file: string;
  label: string;
  /** Seeded channel id - see TOUR_IDS in components/tour/tour-steps.ts. */
  channelId: string;
}

const SHOPEE_MAIN = '0d000000-0000-4000-8000-000000000001';
const LAZADA_MAIN = '0d000000-0000-4000-8000-000000000003';
const TIKTOK_LIVE = '0d000000-0000-4000-8000-000000000006';

const pickSpec = async (spec: SampleSpec, onPick: (file: File, channelId: string) => void) => {
  const response = await fetch(`/demo-files/${spec.file}`);
  if (!response.ok) return;
  const blob = await response.blob();
  onPick(new File([blob], spec.file, { type: 'text/csv' }), spec.channelId);
};

export function SampleFileButtons({
  disabled = false,
  onPick,
}: {
  disabled?: boolean;
  onPick: (file: File, channelId: string) => void;
}) {
  if (!GUIDED_DEMO) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
        <Sparkles className="size-3.5 text-emerald-600" aria-hidden />
        ใช้ไฟล์ตัวอย่าง (ช่องทางถูกเลือกให้อัตโนมัติ)
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          data-tour-id="sample-file-shopee-am"
          disabled={disabled}
          onClick={() =>
            void pickSpec(
              {
                tourId: 'sample-file-shopee-am',
                file: 'shopee-demo-2026-09-19-am.csv',
                label: 'Shopee (เช้า)',
                channelId: SHOPEE_MAIN,
              },
              onPick,
            )
          }
        >
          Shopee (เช้า)
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-tour-id="sample-file-shopee-pm"
          disabled={disabled}
          onClick={() =>
            void pickSpec(
              {
                tourId: 'sample-file-shopee-pm',
                file: 'shopee-demo-2026-09-19-pm.csv',
                label: 'Shopee (บ่าย)',
                channelId: SHOPEE_MAIN,
              },
              onPick,
            )
          }
        >
          Shopee (บ่าย)
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-tour-id="sample-file-lazada"
          disabled={disabled}
          onClick={() =>
            void pickSpec(
              {
                tourId: 'sample-file-lazada',
                file: 'lazada-demo-2026-09-19.csv',
                label: 'Lazada',
                channelId: LAZADA_MAIN,
              },
              onPick,
            )
          }
        >
          Lazada
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-tour-id="sample-file-tiktok"
          disabled={disabled}
          onClick={() =>
            void pickSpec(
              {
                tourId: 'sample-file-tiktok',
                file: 'tiktok-demo-2026-09-19.csv',
                label: 'TikTok Shop',
                channelId: TIKTOK_LIVE,
              },
              onPick,
            )
          }
        >
          TikTok Shop
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">หรือจะลากไฟล์ของร้านคุณเองเข้ามาก็ได้</p>
    </div>
  );
}
