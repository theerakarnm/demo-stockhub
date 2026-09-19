'use client';

/**
 * The bill's FIFO lot trace: exactly which lot each line drew from, at which
 * cost. Scene 13 of the walkthrough - the proof that 103,400.00 is real lot
 * history and not an average guess.
 *
 * Data source: GET /movements?orderId=... whose rows carry the original
 * movement_lot_consumptions slices. The whole card is cost data, so it renders
 * inside <PermissionGate permission="cost:read"> and every figure goes through
 * <CostValue> - stripped JSON means the card renders nothing at all.
 */

import { CostValue } from '@/components/cost-value';
import { Card, CardBody, CardHeader } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Movement } from '@/lib/api-types';
import { baht } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export function LotTraceCard({ orderId }: { orderId: string }) {
  const query = useApi(() => api.getMovements({ orderId, limit: 50 }), [orderId]);
  const movements = query.data?.items ?? [];
  // Consumptions are cost-gated: a cost-blind role receives rows with the key
  // stripped, so an empty slice list renders nothing rather than zeros.
  const slices = movements.flatMap((movement) =>
    (movement.consumptions ?? []).map((slice) => ({ ...slice, reason: movement.reason })),
  );
  const totalCost = slices.reduce((sum, slice) => sum + slice.lineCost, 0);

  return (
    <Card data-tour-id="lot-trace-card">
      <CardHeader
        title="การไล่ล็อต FIFO ของบิลนี้"
        description="บิลนี้ตัดของจากล็อตไหน จำนวนเท่าไร ที่ต้นทุนล็อตจริง"
      />
      <CardBody>
        {query.loading ? (
          <p className="text-sm text-slate-500">กำลังโหลด...</p>
        ) : query.error ? (
          <p className="text-sm text-rose-600">{query.error.message}</p>
        ) : slices.length === 0 ? (
          <p className="text-sm text-slate-500">บิลนี้ยังไม่มีการตัดล็อต</p>
        ) : (
          <div className="space-y-1 text-sm">
            {slices.map((slice, index) => (
              <div
                key={`${slice.lotId}-${index}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="font-mono text-xs text-slate-500">
                  {slice.lotId.slice(0, 8)}...
                </span>
                <span className="text-slate-700">
                  {slice.qty} x <CostValue value={slice.unitCost} />
                </span>
                <span className="font-medium text-slate-900">
                  <CostValue value={slice.lineCost} />
                </span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="font-medium text-slate-600">ทุนรวมของบิล</span>
              <span className="font-semibold text-slate-900">
                <CostValue value={totalCost} />
              </span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
