'use client';

/**
 * /reports/profit - revenue, platform fee, FIFO cost and profit per channel
 * and per order.
 *
 * Like /reports/cogs, the whole page is cost-gated. Roles without `cost:read`
 * never trigger the request: the endpoint answers 403 anyway, and a locked
 * card is more honest than an error.
 *
 * Every money row keeps the identity `profit = revenue - fee - cogs`; the fee
 * is the channel default unless it was overridden on the order, which is why
 * the footnote points at the order page.
 */

import { CostValue } from '@/components/cost-value';
import { ChannelBadge, OrderStatusBadge } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
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
import type { ProfitReportResponse } from '@/lib/api-types';
import { baht, formatDateTime, qty, toDateInputValue } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { Lock, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

const DAYS_BACK = 30;

const defaultRange = (): { from: string; to: string } => {
  const today = new Date();
  const start = new Date(today.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  return { from: toDateInputValue(start), to: toDateInputValue(today) };
};

export default function ProfitReportPage() {
  const { role, hasPermission } = useRole();
  const allowed = hasPermission('cost:read');
  const initialRange = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [channelId, setChannelId] = useState('');

  // The channel list only feeds the filter dropdown; the orders page loads it
  // the same way, so it is safe for every role that can open this screen.
  const channels = useApi(() => api.getChannels(), [role]);

  // Same short-circuit as the COGS page: no request leaves the browser for
  // roles without cost:read.
  const { data, error, loading, reload } = useApi<ProfitReportResponse | null>(
    () =>
      allowed
        ? api.getProfitReport({ from, to, channelId: channelId || undefined })
        : Promise.resolve(null),
    [allowed, from, to, channelId, role],
  );

  if (!allowed) {
    return (
      <>
        <PageHeader title="รายงานกำไร" />
        <Card className="mx-auto max-w-lg">
          <CardBody>
            <EmptyState
              icon={<Lock className="size-5" aria-hidden />}
              title="ตำแหน่งงานของคุณไม่สามารถดูรายงานกำไรได้"
              description="รายงานนี้แสดงรายได้ ค่าธรรมเนียม ต้นทุน และกำไร จึงเปิดให้เฉพาะตำแหน่งที่มีสิทธิ์ cost:read เช่น เจ้าของกิจการหรือผู้จัดการ"
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const rows = data?.rows ?? [];
  const channelRows = data?.channelRows ?? [];
  const isEmpty = !loading && !error && data !== null && rows.length === 0;

  const channelOptions = (channels.data ?? []).map((channel) => ({
    value: channel.id,
    label: channel.name,
  }));

  return (
    <>
      <PageHeader
        title="รายงานกำไร"
        description="ยอดขาย ค่าธรรมเนียม ต้นทุน FIFO และกำไร แยกตามช่องทางขายและรายออเดอร์"
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
            <div className="w-48">
              <Select
                label="ช่องทางขาย"
                name="channelId"
                placeholder="ทุกช่องทาง"
                options={channelOptions}
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
              />
            </div>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="ออเดอร์รวม"
          value={data ? qty(data.totals.orders) : '-'}
          loading={loading && !data}
        />
        <StatCard
          label="หน่วยที่ขายรวม"
          value={data ? qty(data.totals.unitsSold) : '-'}
          loading={loading && !data}
        />
        <StatCard
          label="ยอดขายรวม"
          value={data ? baht(data.totals.revenue) : '-'}
          loading={loading && !data}
        />
        <StatCard
          label="ค่าธรรมเนียมรวม"
          value={<CostValue value={data?.totals.fee} />}
          loading={loading && !data}
        />
        <StatCard
          label="ต้นทุนรวม (FIFO)"
          value={<CostValue value={data?.totals.cogs} />}
          loading={loading && !data}
        />
        <StatCard
          label="กำไรรวม"
          value={<CostValue value={data?.totals.profit} />}
          tone="positive"
          loading={loading && !data}
          icon={<TrendingUp className="size-4" aria-hidden />}
        />
      </div>

      {!error && channelRows.length > 0 ? (
        <Card className="mb-4">
          <CardHeader title="กำไรตามช่องทางขาย" description="สรุปทั้งช่วงวันที่ที่เลือก เรียงจากกำไรมากไปน้อย" />
          <TableWrap>
            <Table>
              <Thead>
                <Tr>
                  <Th>ช่องทาง</Th>
                  <Th numeric>ออเดอร์</Th>
                  <Th numeric>ยอดขาย</Th>
                  <Th numeric>ค่าธรรมเนียม</Th>
                  <Th numeric>ต้นทุน (FIFO)</Th>
                  <Th numeric>กำไร</Th>
                </Tr>
              </Thead>
              <Tbody>
                {channelRows.map((row) => (
                  <Tr key={row.channelId}>
                    <Td>
                      <ChannelBadge kind={row.channelKind} />{' '}
                      <span className="align-middle text-slate-900">{row.channelName}</span>
                    </Td>
                    <Td numeric>{qty(row.orders)}</Td>
                    <Td numeric>
                      <CostValue value={row.revenue} />
                    </Td>
                    <Td numeric>
                      <CostValue value={row.fee} />
                    </Td>
                    <Td numeric>
                      <CostValue value={row.cogs} />
                    </Td>
                    <Td numeric>
                      <CostValue value={row.profit} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="กำไรรายออเดอร์" description="เรียงจากออเดอร์ล่าสุดไปเก่าสุด" />
        {loading && !data ? <TableSkeleton rows={8} cols={9} /> : null}
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {isEmpty ? (
          <EmptyState
            title="ยังไม่มีออเดอร์ที่ตัดสต็อกในช่วงนี้"
            description="ลองขยายช่วงวันที่ เปลี่ยนช่องทาง หรือนำเข้าออเดอร์ของช่วงนั้นก่อน"
            icon={<TrendingUp className="size-5" aria-hidden />}
          />
        ) : null}

        {!error && rows.length > 0 && data ? (
          <TableWrap>
            <Table>
              <Thead>
                <Tr>
                  <Th>วันที่</Th>
                  <Th>เลขที่ออเดอร์</Th>
                  <Th>ช่องทาง</Th>
                  <Th>สถานะ</Th>
                  <Th numeric>หน่วยที่ขาย</Th>
                  <Th numeric>ยอดขาย</Th>
                  <Th numeric>ค่าธรรมเนียม</Th>
                  <Th numeric>ต้นทุน (FIFO)</Th>
                  <Th numeric>กำไร</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td className="whitespace-nowrap text-slate-900">
                      {formatDateTime(row.orderedAt)}
                    </Td>
                    <Td className="font-mono text-xs text-slate-900">{row.externalOrderId}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ChannelBadge kind={row.channelKind} />
                        <span className="text-xs text-slate-500">{row.channelName}</span>
                      </div>
                    </Td>
                    <Td>
                      <OrderStatusBadge status={row.status} />
                    </Td>
                    <Td numeric>{qty(row.unitsSold)}</Td>
                    <Td numeric className="font-medium text-slate-900">
                      {baht(row.revenue)}
                    </Td>
                    <Td numeric>
                      <CostValue value={row.fee} />
                    </Td>
                    <Td numeric>
                      <CostValue value={row.cogs} />
                    </Td>
                    <Td numeric>
                      <CostValue value={row.profit} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <Tr>
                  <Td className="font-semibold text-slate-900">รวม</Td>
                  <Td />
                  <Td />
                  <Td />
                  <Td numeric className="font-semibold text-slate-900">
                    {qty(data.totals.unitsSold)}
                  </Td>
                  <Td numeric className="font-semibold text-slate-900">
                    {baht(data.totals.revenue)}
                  </Td>
                  <Td numeric className="font-semibold">
                    <CostValue value={data.totals.fee} />
                  </Td>
                  <Td numeric className="font-semibold">
                    <CostValue value={data.totals.cogs} />
                  </Td>
                  <Td numeric className="font-semibold">
                    <CostValue value={data.totals.profit} />
                  </Td>
                </Tr>
              </tfoot>
            </Table>
          </TableWrap>
        ) : null}
      </Card>

      <p className="mt-3 text-xs text-slate-500">
        ค่าธรรมเนียมเป็นค่าที่ตั้งไว้ต่อช่องทาง แก้ได้ที่หน้าออเดอร์ ส่วนต้นทุนมาจากสมุดบัญชีสต็อกของระบบ (FIFO)
        เหมือนหน้ารายงานต้นทุน ทำให้กำไรที่เห็นคือกำไรจากต้นทุนที่ตัดจริง
      </p>
    </>
  );
}
