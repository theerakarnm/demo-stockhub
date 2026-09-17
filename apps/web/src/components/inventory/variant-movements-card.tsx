'use client';

/**
 * Movement history of one variant - the audit trail that answers "ของหายไปไหน".
 * Cost columns stay out of this table on purpose: the lots card above already
 * carries the cost story, and this list must stay readable for warehouse staff.
 */

import { MovementReasonBadge, QtyDelta } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Table,
  TableSkeleton,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { History } from 'lucide-react';

export function VariantMovementsCard({ variantId }: { variantId: string }) {
  const { role } = useRole();
  const { data, error, loading, reload } = useApi(
    () => api.getVariantMovements(variantId, { limit: 50 }),
    [variantId, role],
  );

  const rows = data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="ประวัติความเคลื่อนไหว"
        description="ทุกการรับเข้า ตัดขาย คืนสินค้า และปรับยอด เรียงจากล่าสุด"
      />
      {loading && !data ? <TableSkeleton rows={5} cols={6} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีความเคลื่อนไหว"
          description="สินค้านี้ยังไม่เคยถูกรับเข้าหรือตัดออกจากคลัง"
          icon={<History className="size-5" aria-hidden />}
        />
      ) : null}
      {!error && rows.length > 0 ? (
        <TableWrap>
          <Table>
            <Thead>
              <tr>
                <Th>วันเวลา</Th>
                <Th>ประเภท</Th>
                <Th numeric>จำนวน</Th>
                <Th>ช่องทาง</Th>
                <Th>อ้างอิงออเดอร์</Th>
                <Th>หมายเหตุ</Th>
              </tr>
            </Thead>
            <Tbody>
              {rows.map((movement) => (
                <Tr key={movement.id}>
                  <Td className="whitespace-nowrap text-slate-500">
                    {formatDateTime(movement.occurredAt)}
                  </Td>
                  <Td>
                    <MovementReasonBadge reason={movement.reason} />
                  </Td>
                  <Td numeric>
                    <QtyDelta value={movement.qtyDelta} />
                  </Td>
                  <Td className="text-slate-500">{movement.channelName ?? '-'}</Td>
                  <Td className="font-mono text-xs text-slate-500">{movement.orderRef ?? '-'}</Td>
                  <Td className="text-slate-500">{movement.note ?? '-'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      ) : null}
    </Card>
  );
}
