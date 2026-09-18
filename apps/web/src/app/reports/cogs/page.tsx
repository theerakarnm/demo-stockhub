'use client';

/**
 * /reports/cogs - sales, FIFO cost and gross margin per day and channel.
 *
 * The whole page is cost-gated. Roles without `cost:read` never trigger the
 * request: the API would answer 403 anyway, and showing a locked card is more
 * honest than showing an error.
 *
 * The rows come straight from the movement ledger (movement_lot_consumptions
 * joined to stock_movements), so the cost of a sale here is the cost the FIFO
 * engine actually consumed - the same number the order detail shows.
 */

import { CostValue } from '@/components/cost-value';
import { ChannelBadge } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import {
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  StatCard,
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
import type { CogsReportResponse } from '@/lib/api-types';
import { baht, qty, toDateInputValue } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { BarChart3, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';

const DAYS_BACK = 30;

const defaultRange = (): { from: string; to: string } => {
  const today = new Date();
  const start = new Date(today.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  return { from: toDateInputValue(start), to: toDateInputValue(today) };
};

/** Thai short date for a 'YYYY-MM-DD' Bangkok calendar day. */
const formatDay = (day: string): string =>
  new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short' }).format(
    new Date(`${day}T00:00:00+07:00`),
  );

export default function CogsReportPage() {
  const { role, hasPermission } = useRole();
  const allowed = hasPermission('cost:read');
  const initialRange = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);

  // The fetcher short-circuits for roles without cost:read - no request leaves
  // the browser, so the demo cannot leak a cost number by accident.
  const { data, error, loading, reload } = useApi<CogsReportResponse | null>(
    () => (allowed ? api.getCogsReport({ from, to }) : Promise.resolve(null)),
    [allowed, from, to, role],
  );

  if (!allowed) {
    return (
      <>
        <PageHeader title="รายงานต้นทุนขาย (FIFO)" />
        <Card className="mx-auto max-w-lg">
          <CardBody>
            <EmptyState
              icon={<Lock className="size-5" aria-hidden />}
              title="ตำแหน่งงานของคุณไม่สามารถดูรายงานต้นทุนได้"
              description="รายงานนี้แสดงต้นทุนและกำไรขั้นต้นรายช่องทาง จึงเปิดให้เฉพาะตำแหน่งที่มีสิทธิ์ cost:read เช่น เจ้าของกิจการหรือผู้จัดการ"
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const rows = data?.rows ?? [];
  const isEmpty = !loading && !error && data !== null && rows.length === 0;

  return (
    <>
      <PageHeader
        title="รายงานต้นทุนขาย (FIFO)"
        description="ยอดขาย ต้นทุน และกำไรขั้นต้นรายวันแยกตามช่องทางขาย"
        actions={
          <div className="flex items-end gap-2">
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
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="หน่วยที่ขายรวม"
          value={data ? qty(data.totals.unitsSold) : '-'}
          loading={loading && !data}
          icon={<BarChart3 className="size-4" aria-hidden />}
        />
        <StatCard
          label="ยอดขายรวม"
          value={data ? baht(data.totals.revenue) : '-'}
          loading={loading && !data}
        />
        <StatCard
          label="ต้นทุนขายรวม (COGS)"
          value={<CostValue value={data?.totals.cogs} />}
          loading={loading && !data}
        />
        <StatCard
          label="กำไรขั้นต้น"
          value={<CostValue value={data?.totals.margin} />}
          tone="positive"
          loading={loading && !data}
        />
      </div>

      <Card>
        {loading && !data ? <TableSkeleton rows={8} cols={6} /> : null}
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {isEmpty ? (
          <EmptyState
            title="ไม่มียอดขายในช่วงที่เลือก"
            description="ลองขยายช่วงวันที่ หรือตรวจสอบว่าได้นำเข้าออเดอร์ของช่วงนั้นแล้ว"
            icon={<BarChart3 className="size-5" aria-hidden />}
          />
        ) : null}

        {!error && rows.length > 0 && data ? (
          <TableWrap>
            <Table>
              <Thead>
                <Tr>
                  <Th>วันที่</Th>
                  <Th>ช่องทาง</Th>
                  <Th numeric>หน่วยที่ขาย</Th>
                  <Th numeric>ยอดขาย</Th>
                  <Th numeric>ต้นทุน (FIFO)</Th>
                  <Th numeric>กำไรขั้นต้น</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row) => (
                  <Tr key={`${row.date}-${row.channelId}`}>
                    <Td className="whitespace-nowrap text-slate-900">{formatDay(row.date)}</Td>
                    <Td>
                      <ChannelBadge kind={row.kind} />{' '}
                      <span className="align-middle text-slate-900">{row.channelName}</span>
                    </Td>
                    <Td numeric>{qty(row.unitsSold)}</Td>
                    <Td numeric>{baht(row.revenue)}</Td>
                    <Td numeric>
                      <CostValue value={row.cogs} />
                    </Td>
                    <Td numeric>
                      <CostValue value={row.margin} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <Tr>
                  <Td className="font-semibold text-slate-900">รวม</Td>
                  <Td />
                  <Td numeric className="font-semibold text-slate-900">
                    {qty(data.totals.unitsSold)}
                  </Td>
                  <Td numeric className="font-semibold text-slate-900">
                    {baht(data.totals.revenue)}
                  </Td>
                  <Td numeric className="font-semibold">
                    <CostValue value={data.totals.cogs} />
                  </Td>
                  <Td numeric className="font-semibold">
                    <CostValue value={data.totals.margin} />
                  </Td>
                </Tr>
              </tfoot>
            </Table>
          </TableWrap>
        ) : null}
      </Card>

      <p className="mt-3 text-xs text-slate-500">
        ตัวเลขต้นทุนมาจากสมุดบัญชีสต็อกของระบบ (movement_lot_consumptions) ซึ่งบันทึกล็อตต้นทุนจริงที่ถูกขายออกไปตามคิว
        FIFO ทำให้ต้นทุนของทุกช่องทางตรงกับสต็อกที่ตัดจริงในคลังกลาง
      </p>
    </>
  );
}
