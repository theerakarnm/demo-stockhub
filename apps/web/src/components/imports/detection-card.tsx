/**
 * Result of OrderSourceAdapter.detect() plus the parse counters.
 *
 * The customer question this answers is "how does it know this file is Shopee".
 * Show the reason verbatim, never a bare confidence number.
 */

import { ChannelBadge } from '@/components/domain-badges';
import type { ImportBatch } from '@/lib/api-types';
import { percent, qty } from '@/lib/format';
import { ScanSearch } from 'lucide-react';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function DetectionCard({ batch }: { batch: ImportBatch }) {
  const kind = batch.detectedKind ?? batch.channelKind;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <ScanSearch className="size-4 text-sky-600" aria-hidden />
          <span className="text-sm font-medium text-slate-900">ระบบอ่านไฟล์นี้เป็น</span>
          {kind ? (
            <ChannelBadge kind={kind} />
          ) : (
            <span className="text-sm text-slate-500">ไม่ทราบช่องทาง</span>
          )}
          {batch.detectionConfidence !== undefined ? (
            <span className="text-sm text-slate-600">
              ความมั่นใจ {percent(batch.detectionConfidence, 0)}
            </span>
          ) : null}
        </div>
        {batch.detectionReason ? (
          <p className="mt-1.5 text-xs text-slate-600">
            เหตุผล: &quot;{batch.detectionReason}&quot;
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="แถวที่อ่านได้" value={qty(batch.rowsRead)} />
        <Stat label="ออเดอร์ที่แยกได้" value={qty(batch.ordersParsed)} />
        <Stat label="รายการสินค้าที่แยกได้" value={qty(batch.linesParsed)} />
      </div>
    </div>
  );
}
