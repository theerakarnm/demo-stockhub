'use client';

/**
 * /orders/[id]/print - printable Thai bill (A4).
 *
 * Decision D2: the PDF is produced by the browser (window.print -> save as
 * PDF), not by a Workers library. The page renders ONLY the bill sheet: app
 * chrome opts out with print:hidden, and the @media print block in
 * globals.css resets the page to a plain white A4 flow.
 *
 * Cost rule: this page reads prices only (unitPrice, discount, lineTotal,
 * grandTotal). It never touches cogs / margin / line.totalCost, even when the
 * caller's role received them, so a printed bill can never leak a cost figure.
 */

import { ChannelBadge, OrderStatusBadge } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import { Button, Card, CardSkeleton, ErrorState, buttonClass } from '@/components/ui';
import { api } from '@/lib/api-client';
import { customersApi } from '@/lib/api-pricing';
import type { Order } from '@/lib/api-types';
import { money, qty } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { can } from '@stockhub/core';
import type { ChannelKind } from '@stockhub/core';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const BILL_TITLES: Record<ChannelKind, string> = {
  pos: 'บิลขายหน้าร้าน',
  wholesale: 'บิลขายส่ง',
  shopee: 'บิลขายออนไลน์',
  lazada: 'บิลขายออนไลน์',
  tiktok: 'บิลขายออนไลน์',
  manual: 'บิลขาย',
};

/** Bill header. Every line under the org name is a placeholder for the demo. */
function SellerHeader({ orgName }: { orgName: string }) {
  return (
    <div>
      {/* TODO(template): seller address, tax id and logo come from org settings. */}
      <p className="text-2xl font-bold text-slate-900">{orgName}</p>
      <p className="mt-1 text-xs text-slate-600">
        ที่อยู่: หมู่ 4 ตำบลสันกำแพง อำเภอสันกำแพง จังหวัดเชียงใหม่ 50240
      </p>
      <p className="text-xs text-slate-600">โทร: 000-000-0000</p>
    </div>
  );
}

function BillSheet({
  order,
  customer,
  orgName,
}: {
  order: Order;
  customer: { phone?: string; priceTierName?: string } | null;
  orgName: string;
}) {
  const totalUnits = order.lines.reduce((sum, line) => sum + line.quantity, 0);

  // Padding stays in print too: the @page margin is 0, the sheet itself
  // provides the A4 margins (see the print block in globals.css).
  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white px-[14mm] py-[12mm] text-slate-900 shadow-sm print:max-w-none print:shadow-none">
      <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-4">
        <SellerHeader orgName={orgName} />
        <div className="text-right">
          <p className="text-lg font-bold">{BILL_TITLES[order.channelKind]}</p>
          <p className="mt-1 text-sm">เลขที่บิล {order.externalOrderId}</p>
          <p className="text-sm">
            วันที่{' '}
            {new Intl.DateTimeFormat('th-TH', {
              dateStyle: 'long',
            }).format(new Date(order.orderedAt))}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-between gap-4 text-sm">
        <div>
          <p className="text-slate-500">ลูกค้า</p>
          <p className="font-medium">{order.customerName ?? 'ลูกค้าหน้าร้าน'}</p>
          {customer?.phone ? <p className="text-slate-600">โทร {customer.phone}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-slate-500">ช่องทาง / สถานะ</p>
          <p className="mt-0.5 flex justify-end gap-2">
            <ChannelBadge kind={order.channelKind} />
            <OrderStatusBadge status={order.status} />
          </p>
          {customer?.priceTierName ? (
            <p className="mt-1 text-slate-600">ระดับราคา {customer.priceTierName}</p>
          ) : null}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-slate-800 text-left">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">รายการ</th>
            <th className="py-1.5 pr-2 text-right font-medium">จำนวน</th>
            <th className="py-1.5 pr-2 text-right font-medium">ราคา/หน่วย</th>
            <th className="py-1.5 pr-2 text-right font-medium">ส่วนลด</th>
            <th className="py-1.5 text-right font-medium">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line, index) => (
            <tr key={line.id} className="border-b border-slate-200 align-top">
              <td className="py-1.5 pr-2 tabular-nums">{index + 1}</td>
              <td className="py-1.5 pr-2">
                {line.name}
                <span className="block font-mono text-[11px] text-slate-500">{line.sku}</span>
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{qty(line.quantity)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{money(line.unitPrice)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {line.discount > 0 ? money(line.discount) : '-'}
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums">
                {money(line.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">รวม {qty(totalUnits)} หน่วย</span>
            <span className="text-xs text-slate-500">หน่วยเงิน: บาท (THB)</span>
          </div>
          <div className="flex justify-between border-t-2 border-slate-800 pt-1.5 text-base font-bold">
            <span>ยอดรวมสุทธิ</span>
            <span className="tabular-nums">{money(order.grandTotal)}</span>
          </div>
        </div>
      </div>

      <div className="mt-10 flex items-end justify-between text-sm">
        <p className="text-slate-600">ขอบคุณที่ใช้บริการ</p>
        <div className="w-56 border-t border-slate-400 pt-1 text-center text-xs text-slate-600">
          ลงชื่อผู้รับสินค้า / ผู้จ่ายเงิน
        </div>
      </div>
      <p className="mt-6 text-[10px] text-slate-400">
        ออกจากระบบ StockHub · เอกสารฉบับนี้เป็นสำเนา · {order.id}
      </p>
    </div>
  );
}

export default function OrderPrintPage() {
  const { role, orgName } = useRole();
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';

  const { data, error, loading, reload } = useApi(() => api.getOrder(orderId), [orderId, role]);

  // Phone and tier name live on the customer record. Fetch it only when the
  // role may read customers; other roles print the bill without them.
  const customerId = data?.customerId;
  const canReadCustomers = can(role, 'customer:read');
  const customer = useApi(
    () =>
      customerId && canReadCustomers
        ? customersApi.get(customerId).catch(() => null)
        : Promise.resolve(null),
    [customerId, canReadCustomers, role],
  );

  return (
    <>
      {/* Screen-only toolbar. The bill sheet below is the only thing that prints. */}
      <div className="mx-auto mb-4 flex w-full max-w-[210mm] items-center justify-between print:hidden">
        <Link
          href={`/orders/${orderId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-600"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          กลับไปหน้าบิล
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          พิมพ์บิล / บันทึก PDF
        </Button>
      </div>

      {loading && !data ? (
        <div className="mx-auto w-full max-w-[210mm] print:hidden">
          <CardSkeleton />
        </div>
      ) : null}

      {error ? (
        <div className="mx-auto w-full max-w-[210mm] print:hidden">
          <Card>
            <ErrorState error={error} onRetry={reload} />
          </Card>
        </div>
      ) : null}

      {data && !error ? (
        <BillSheet order={data} customer={customer.data} orgName={orgName} />
      ) : null}

      {/* No data yet (still loading): printing would emit an empty sheet. */}
      {!data ? (
        <p className="mt-4 text-center text-xs text-slate-400 print:hidden">รอโหลดข้อมูลบิลก่อนสั่งพิมพ์</p>
      ) : null}
    </>
  );
}
