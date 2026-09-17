'use client';

/**
 * /movements - the stock ledger.
 *
 * Every row is an immutable movement written by an import, a manual bill or an
 * adjustment. This screen is the answer to "ทำไมของหาย" so it never aggregates:
 * one row in the table is one row in the database.
 */

import { CostLockedNote, CostValue } from '@/components/cost-value';
import { ChannelBadge, MovementReasonBadge, QtyDelta } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
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
import { formatDateTime, toDateInputValue } from '@/lib/format';
import { movementReasonOptions } from '@/lib/labels';
import { useApi } from '@/lib/use-api';
import { isInbound } from '@stockhub/core';
import type { ChannelKind, MovementReason } from '@stockhub/core';
import { ArrowLeftRight } from 'lucide-react';
import { useMemo, useState } from 'react';

const DAYS_BACK = 30;

/** Default window: the last 30 days, which matches the marketplace export habit. */
const defaultRange = (): { from: string; to: string } => {
  const today = new Date();
  const start = new Date(today.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  return { from: toDateInputValue(start), to: toDateInputValue(today) };
};

/** Channel chip for a ledger row. Falls back to plain text when the kind is unknown. */
function ChannelCell({
  channelId,
  channelName,
  kind,
}: {
  channelId?: string;
  channelName?: string;
  kind?: ChannelKind;
}) {
  if (!channelId) return <span className="text-slate-400">-</span>;
  if (!kind) return <span className="text-xs text-slate-500">{channelName ?? channelId}</span>;
  return <ChannelBadge kind={kind} label={channelName} />;
}

export default function MovementsPage() {
  const { role, canReadCost } = useRole();
  const initialRange = useMemo(defaultRange, []);
  const [reason, setReason] = useState<MovementReason | ''>('');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);

  const channels = useApi(() => api.getChannels(), [role]);
  const movements = useApi(
    () =>
      api.getMovements({
        reason: reason || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 100,
      }),
    [reason, from, to, role],
  );

  // Movement rows carry channelId/channelName but not the kind, so the chip
  // colour comes from the channel list.
  const channelKindById = useMemo(() => {
    const map = new Map<string, ChannelKind>();
    for (const channel of channels.data ?? []) map.set(channel.id, channel.kind);
    return map;
  }, [channels.data]);

  const resetFilters = () => {
    setReason('');
    setFrom(initialRange.from);
    setTo(initialRange.to);
  };

  const rows = movements.data?.items ?? [];
  const isEmpty = !movements.loading && !movements.error && rows.length === 0;

  return (
    <>
      <PageHeader
        title="ความเคลื่อนไหวสต็อก"
        description="บันทึกการรับเข้าและตัดออกทุกรายการ ย้อนดูได้ว่าของหายไปกับออเดอร์ไหน"
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-4 py-3">
          <div className="w-64">
            <Select
              label="ประเภท"
              name="reason"
              placeholder="ทุกประเภท"
              options={movementReasonOptions}
              value={reason}
              onChange={(event) => setReason(event.target.value as MovementReason | '')}
            />
          </div>
          <div className="w-40">
            <Input
              label="ตั้งแต่วันที่"
              name="from"
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="w-40">
            <Input
              label="ถึงวันที่"
              name="to"
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={resetFilters}>
            ล้างตัวกรอง
          </Button>
        </div>

        {movements.loading && !movements.data ? <TableSkeleton rows={8} cols={7} /> : null}
        {movements.error ? <ErrorState error={movements.error} onRetry={movements.reload} /> : null}
        {isEmpty ? (
          <EmptyState
            title="ไม่มีความเคลื่อนไหวในช่วงที่เลือก"
            description="ลองขยายช่วงวันที่ หรือเลือกประเภทอื่น"
            icon={<ArrowLeftRight className="size-5" aria-hidden />}
          />
        ) : null}

        {!movements.error && rows.length > 0 ? (
          <TableWrap>
            <Table>
              <Thead>
                <Tr>
                  <Th>วันเวลา</Th>
                  <Th>สินค้า</Th>
                  <Th>ประเภท</Th>
                  <Th numeric>จำนวน</Th>
                  <Th>ช่องทาง</Th>
                  <Th>อ้างอิงออเดอร์</Th>
                  <Th numeric>ต้นทุน/หน่วย</Th>
                  <Th numeric>มูลค่า</Th>
                  <Th>หมายเหตุ</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((movement) => {
                  const inbound = isInbound(movement.reason);
                  const kind = movement.channelId
                    ? channelKindById.get(movement.channelId)
                    : undefined;
                  return (
                    <Tr
                      key={movement.id}
                      className={
                        inbound ? 'border-l-2 border-l-emerald-400' : 'border-l-2 border-l-rose-400'
                      }
                    >
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDateTime(movement.occurredAt)}
                      </Td>
                      <Td>
                        <p className="font-medium text-slate-900">{movement.name}</p>
                        <p className="font-mono text-xs text-slate-500">{movement.sku}</p>
                      </Td>
                      <Td>
                        <MovementReasonBadge reason={movement.reason} />
                      </Td>
                      <Td numeric>
                        <QtyDelta value={movement.qtyDelta} />
                      </Td>
                      <Td>
                        <ChannelCell
                          channelId={movement.channelId}
                          channelName={movement.channelName}
                          kind={kind}
                        />
                      </Td>
                      <Td className="font-mono text-xs text-slate-600">
                        {movement.orderRef ?? movement.orderId ?? '-'}
                      </Td>
                      <Td numeric>
                        <CostValue value={movement.unitCost} />
                      </Td>
                      <Td numeric>
                        <CostValue value={movement.totalCost} />
                      </Td>
                      <Td
                        className="max-w-56 truncate text-xs text-slate-500"
                        title={movement.note}
                      >
                        {movement.note ?? '-'}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableWrap>
        ) : null}
      </Card>

      {canReadCost ? null : <CostLockedNote className="mt-3" />}
    </>
  );
}
