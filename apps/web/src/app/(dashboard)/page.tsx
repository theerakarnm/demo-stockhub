'use client';

/**
 * Dashboard - step 1 of the sales demo.
 *
 * The story on this screen: one central stock pool, every channel deducting
 * from it, and cost figures that appear or disappear with the job position.
 *
 * Route note: the (dashboard) folder is a route group, so this file serves "/".
 */

import { CostValue } from '@/components/cost-value';
import { ChannelBadge, MovementReasonBadge, QtyDelta } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import {
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
  Table,
  TableSkeleton,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  buttonClass,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { baht, formatDate, formatRelative, qty } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  FileSpreadsheet,
  Layers,
  Link2Off,
  Scale,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';

const RECENT_MOVEMENT_LIMIT = 8;

export default function DashboardPage() {
  const { role, orgName } = useRole();

  // `role` is in both dependency lists: switching job position must refetch,
  // because the API strips the cost fields per role.
  const summary = useApi(() => api.getDashboardSummary(), [role]);
  const movements = useApi(() => api.getMovements({ limit: RECENT_MOVEMENT_LIMIT }), [role]);
  // Report sections: the last seven Bangkok days, today included.
  const channelSales = useApi(() => api.getChannelSalesReport({ days: 7 }), [role]);
  const variance = useApi(() => api.getVarianceReport({ days: 7 }), [role]);

  const data = summary.data;
  const loading = summary.loading && !data;

  return (
    <>
      <PageHeader
        title="ภาพรวมธุรกิจ"
        description={`สต็อกกลางของ ${orgName} ใช้ร่วมกันทุกช่องทางขาย`}
        actions={
          <Link href="/imports/new" className={buttonClass('primary', 'md')}>
            <FileSpreadsheet className="size-4" aria-hidden />
            นำเข้าไฟล์ออเดอร์
          </Link>
        }
      />

      {summary.error ? (
        <Card className="mb-5">
          <ErrorState error={summary.error} onRetry={summary.reload} />
        </Card>
      ) : null}

      {/* KPI row. Stock value is the cost-gated headline of the role demo. */}
      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : null}

        {data ? (
          <>
            <StatTile
              label="จำนวนสินค้า (SKU)"
              value={qty(data.totalSkus)}
              hint="รวมสินค้าเดี่ยวและสินค้าชุด"
              icon={<Layers className="size-4" aria-hidden />}
            />
            <StatTile
              label="สต็อกคงเหลือรวม"
              value={qty(data.totalOnHand)}
              hint="หน่วยสินค้าทั้งหมดในคลัง"
              icon={<Boxes className="size-4" aria-hidden />}
            />
            <StatTile
              label="มูลค่าสต็อก (ต้นทุน FIFO)"
              value={<CostValue value={data.stockValue} />}
              hint="คิดจากล็อตต้นทุนที่ยังคงเหลือ"
              icon={<Wallet className="size-4" aria-hidden />}
              tone="cost"
            />
            <StatTile
              label="ขายวันนี้"
              value={qty(data.todaySold)}
              hint="หน่วยที่ตัดสต็อกไปแล้ววันนี้"
              icon={<ShoppingCart className="size-4" aria-hidden />}
            />
            <StatTile
              data-tour-id="dashboard-lowstock-card"
              label="สินค้าใกล้หมด"
              value={qty(data.lowStockCount)}
              hint="ต่ำกว่าจุดสั่งซื้อที่ตั้งไว้"
              icon={<AlertTriangle className="size-4" aria-hidden />}
              tone={data.lowStockCount > 0 ? 'warning' : 'default'}
              href="/inventory?lowStock=1"
              linkLabel="ดูรายการ"
            />
            <StatTile
              label="SKU ที่ยังจับคู่ไม่ได้"
              value={qty(data.unmatchedSkus)}
              hint={`ไฟล์รอตรวจสอบ ${qty(data.pendingImports)} ไฟล์`}
              icon={<Link2Off className="size-4" aria-hidden />}
              tone={data.unmatchedSkus > 0 ? 'danger' : 'default'}
              href="/imports"
              linkLabel="ไปหน้านำเข้า"
            />
          </>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Today's sales per channel, straight from the movement ledger. */}
        <Card className="xl:col-span-3">
          <CardHeader
            title="ขายวันนี้ตามช่องทาง"
            description="ตัวเลขเดียวกับที่ตัดสต็อกจริงในคลังกลาง"
            action={
              <Link
                href="/settings/channels"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              >
                ตั้งค่าช่องทาง
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          />
          {loading ? <TableSkeleton rows={6} cols={3} /> : null}
          {data && data.byChannel.length === 0 ? (
            <EmptyState title="ยังไม่มียอดขายวันนี้" description="เมื่อมีออเดอร์ตัดสต็อกวันนี้ ตัวเลขจะแสดงที่นี่" />
          ) : null}
          {data && data.byChannel.length > 0 ? (
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th>ช่องทาง</Th>
                    <Th>ชื่อร้าน</Th>
                    <Th numeric>หน่วยที่ขาย</Th>
                    <Th numeric>ยอดขาย</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.byChannel.map((channel) => (
                    <Tr key={channel.channelId}>
                      <Td>
                        <ChannelBadge kind={channel.kind} />
                      </Td>
                      <Td className="max-w-[16rem] truncate text-slate-900">{channel.name}</Td>
                      <Td numeric>{qty(channel.unitsSoldToday)}</Td>
                      <Td numeric>{baht(channel.revenueToday)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          ) : null}
        </Card>

        {/* Recent movements: proof that every change is traceable. */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="ความเคลื่อนไหวล่าสุด"
            description="ทุกการเปลี่ยนแปลงสต็อกถูกบันทึกไว้"
            action={
              <Link
                href="/movements"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              >
                ดูทั้งหมด
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          />
          {movements.loading && !movements.data ? <TableSkeleton rows={6} cols={3} /> : null}
          {movements.error ? (
            <ErrorState error={movements.error} onRetry={movements.reload} />
          ) : null}
          {movements.data && movements.data.items.length === 0 ? (
            <EmptyState
              title="ยังไม่มีความเคลื่อนไหว"
              description="เมื่อนำเข้าไฟล์ออเดอร์หรือเปิดบิลขาย รายการจะแสดงที่นี่"
            />
          ) : null}
          {movements.data && movements.data.items.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {movements.data.items.map((movement) => (
                <li key={movement.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{movement.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-mono">{movement.sku}</span>
                      <span aria-hidden>/</span>
                      <span>{formatRelative(movement.occurredAt)}</span>
                      {movement.channelName ? (
                        <>
                          <span aria-hidden>/</span>
                          <span className="truncate">{movement.channelName}</span>
                        </>
                      ) : null}
                    </p>
                    <div className="mt-1.5">
                      <MovementReasonBadge reason={movement.reason} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <QtyDelta value={movement.qtyDelta} className="text-sm" />
                    <p className="mt-1 text-xs text-slate-400">
                      <CostValue value={movement.totalCost} fallback="-" />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      {/* Report sections: what sold where, and what explains the drift. */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="ยอดขาย 7 วันล่าสุดตามช่องทาง"
            description="รวมออเดอร์จากทุกสถานะที่ยังไม่ยกเลิกหรือคืนสินค้า"
            action={
              <Link
                href="/orders"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              >
                ดูออเดอร์ทั้งหมด
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          />
          {channelSales.loading && !channelSales.data ? <TableSkeleton rows={5} cols={4} /> : null}
          {channelSales.error ? (
            <ErrorState error={channelSales.error} onRetry={channelSales.reload} />
          ) : null}
          {channelSales.data && channelSales.data.rows.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-5" aria-hidden />}
              title="ยังไม่มียอดขายในช่วง 7 วัน"
              description="เมื่อมีออเดอร์เข้ามาในช่วงนี้ ยอดขายรายช่องทางจะแสดงที่นี่"
            />
          ) : null}
          {channelSales.data && channelSales.data.rows.length > 0 ? (
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th>ช่องทาง</Th>
                    <Th numeric>ออเดอร์</Th>
                    <Th numeric>หน่วยที่ขาย</Th>
                    <Th numeric>ยอดขาย</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {channelSales.data.rows.map((row) => (
                    <Tr key={row.channelId}>
                      <Td>
                        <ChannelBadge kind={row.kind} />
                        <span className="ml-2 max-w-[14rem] truncate align-middle text-slate-900">
                          {row.channelName}
                        </span>
                      </Td>
                      <Td numeric>{qty(row.orders)}</Td>
                      <Td numeric>{qty(row.unitsSold)}</Td>
                      <Td numeric>{baht(row.revenue)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          ) : null}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="สาเหตุความคลาดเคลื่อนล่าสุด"
            description="สต็อกที่เปลี่ยนนอกเหนือจากการรับเข้าและขายออก"
            action={
              <Link
                href="/movements"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              >
                ดูทั้งหมด
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          />
          {variance.loading && !variance.data ? <TableSkeleton rows={5} cols={3} /> : null}
          {variance.error ? <ErrorState error={variance.error} onRetry={variance.reload} /> : null}
          {variance.data && variance.data.rows.length === 0 ? (
            <EmptyState
              icon={<Scale className="size-5" aria-hidden />}
              title="ไม่มีความคลาดเคลื่อนในช่วง 7 วัน"
              description="การปรับสต็อก ยกเลิก และรับคืนจะถูกอธิบายไว้ที่นี่"
            />
          ) : null}
          {variance.data && variance.data.rows.length > 0 ? (
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th>วันที่ / สินค้า</Th>
                    <Th>สาเหตุ</Th>
                    <Th numeric>ผลรวม</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {variance.data.rows.slice(0, 8).map((row) => (
                    <Tr key={`${row.variantId}-${row.day}`}>
                      <Td>
                        <p className="max-w-[13rem] truncate text-slate-900">{row.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          <span className="font-mono">{row.sku}</span>
                          <span aria-hidden> / </span>
                          {formatDate(new Date(`${row.day}T00:00:00+07:00`).toISOString())}
                        </p>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {row.byReason.map((reason) => (
                            <span key={reason.reason} className="inline-flex items-center gap-1">
                              <MovementReasonBadge reason={reason.reason} />
                              <QtyDelta value={reason.qtyDelta} className="text-xs" />
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td numeric>
                        <QtyDelta value={row.qtyDelta} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          ) : null}
        </Card>
      </div>

      {/* Demo guidance, also useful onboarding copy for a real first-run org. */}
      <Card className="mt-4">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">เริ่มใช้งานใน 3 ขั้นตอน</p>
            <p className="mt-1 text-xs text-slate-500">
              1) ดาวน์โหลดไฟล์ออเดอร์จากแต่ละร้าน 2) อัปโหลดเข้า StockHub 3) ตรวจสอบแล้วยืนยันตัดสต็อก
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/inventory" className={buttonClass('outline', 'sm')}>
              ดูสต็อกทั้งหมด
            </Link>
            <Link href="/imports/new" className={buttonClass('primary', 'sm')}>
              นำเข้าไฟล์ออเดอร์
            </Link>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

type TileTone = 'default' | 'warning' | 'danger' | 'cost';

const TONE_CLASSES: Record<TileTone, string> = {
  default: 'bg-slate-100 text-slate-500',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600',
  cost: 'bg-emerald-50 text-emerald-600',
};

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: TileTone;
  href?: string;
  linkLabel?: string;
}

/** Local KPI card. Kept in this file because only the dashboard uses this shape. */
function StatTile({ label, value, hint, icon, tone = 'default', href, linkLabel }: StatTileProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span
          className={`flex size-8 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : <span />}
        {href ? (
          <Link href={href} className="text-xs font-medium text-emerald-700 hover:underline">
            {linkLabel ?? 'ดูเพิ่ม'}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
