'use client';

/**
 * /reports/cogs - gross margin per SKU.
 *
 * The whole page is cost-gated. Roles without `cost:read` never trigger the
 * request: the API would answer 403 anyway, and showing a locked card is more
 * honest than showing an error.
 */

import { CostValue } from '@/components/cost-value';
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
import { baht, percentValue, qty, toDateInputValue } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { BarChart3, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';

const DAYS_BACK = 30;

const defaultRange = (): { from: string; to: string } => {
  const today = new Date();
  const start = new Date(today.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  return { from: toDateInputValue(start), to: toDateInputValue(today) };
};

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
              description="รายงานนี้แสดงต้นทุนและกำไรขั้นต้นรายสินค้า จึงเปิดให้เฉพาะตำแหน่งที่มีสิทธิ์ cost:read เช่น เจ้าของกิจการหรือผู้จัดการ"
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
        description="ยอดขาย ต้นทุน และกำไรขั้นต้นรายสินค้าในช่วงเวลาที่เลือก"
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
          label="ยอดขายรวม"
          value={data ? baht(data.totalRevenue) : '-'}
          loading={loading && !data}
          icon={<BarChart3 className="size-4" aria-hidden />}
        />
        <StatCard
          label="ต้นทุนขายรวม (COGS)"
          value={<CostValue value={data?.totalCogs} />}
          loading={loading && !data}
        />
        <StatCard
          label="กำไรขั้นต้น"
          value={<CostValue value={data?.grossProfit} />}
          tone="positive"
          loading={loading && !data}
        />
        <StatCard
          label="อัตรากำไร"
          value={<CostValue value={data?.marginPct} format={percentValue} />}
          tone="positive"
          loading={loading && !data}
        />
      </div>

      <Card>
        {loading && !data ? <TableSkeleton rows={8} cols={7} /> : null}
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
                  <Th>SKU</Th>
                  <Th>ชื่อสินค้า</Th>
                  <Th numeric>จำนวนที่ขาย</Th>
                  <Th numeric>ยอดขาย</Th>
                  <Th numeric>ต้นทุน</Th>
                  <Th numeric>กำไรขั้นต้น</Th>
                  <Th numeric>อัตรากำไร</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row) => (
                  <Tr key={row.variantId}>
                    <Td className="font-mono text-xs text-slate-900">{row.sku}</Td>
                    <Td className="text-slate-900">{row.name}</Td>
                    <Td numeric>{qty(row.qtySold)}</Td>
                    <Td numeric>{baht(row.revenue)}</Td>
                    <Td numeric>
                      <CostValue value={row.cogs} />
                    </Td>
                    <Td numeric>
                      <CostValue value={row.grossProfit} />
                    </Td>
                    <Td numeric>
                      <CostValue value={row.marginPct} format={percentValue} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <Tr>
                  <Td className="font-semibold text-slate-900">รวม</Td>
                  <Td />
                  <Td numeric className="font-semibold text-slate-900">
                    {qty(rows.reduce((sum, row) => sum + row.qtySold, 0))}
                  </Td>
                  <Td numeric className="font-semibold text-slate-900">
                    {baht(data.totalRevenue)}
                  </Td>
                  <Td numeric className="font-semibold">
                    <CostValue value={data.totalCogs} />
                  </Td>
                  <Td numeric className="font-semibold">
                    <CostValue value={data.grossProfit} />
                  </Td>
                  <Td numeric className="font-semibold">
                    <CostValue value={data.marginPct} format={percentValue} />
                  </Td>
                </Tr>
              </tfoot>
            </Table>
          </TableWrap>
        ) : null}
      </Card>

      <p className="mt-3 text-xs text-slate-500">
        ตัวเลขต้นทุนมาจากการคิดต้นทุนแบบ FIFO ใน @stockhub/core ระบบตัดล็อตที่รับเข้าก่อนเป็นลำดับแรก
        ทำให้ต้นทุนของแต่ละบิลผูกกับล็อตจริงที่ถูกขายออกไป
      </p>
    </>
  );
}
