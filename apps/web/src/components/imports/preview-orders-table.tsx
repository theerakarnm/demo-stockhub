'use client';

/**
 * Orders as parsed from the file, before anything is written to stock.
 *
 * Every row can be expanded, because the trust-building moment of the demo is
 * seeing which internal SKU each marketplace line will hit.
 */

import { MatchSourceBadge, OrderStatusBadge } from '@/components/domain-badges';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui';
import type { PreviewOrder, PreviewOrderLine } from '@/lib/api-types';
import { baht, formatDateTime, qty } from '@/lib/format';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

function LineRows({ lines }: { lines: PreviewOrderLine[] }) {
  // Build the React keys outside JSX: an export may repeat a SKU inside one
  // order, and not every platform gives us a line id.
  const rows = lines.map((line, index) => ({ key: line.externalLineId ?? `line-${index}`, line }));

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="text-slate-500">
          <th className="px-2 py-1.5 text-left font-medium">SKU ในไฟล์</th>
          <th className="px-2 py-1.5 text-left font-medium">ชื่อสินค้าบนแพลตฟอร์ม</th>
          <th className="px-2 py-1.5 text-right font-medium">จำนวน</th>
          <th className="px-2 py-1.5 text-right font-medium">ราคา/หน่วย</th>
          <th className="px-2 py-1.5 text-right font-medium">รวม</th>
          <th className="px-2 py-1.5 text-left font-medium">การจับคู่</th>
          <th className="px-2 py-1.5 text-left font-medium">สินค้าในระบบ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(({ key, line }) => (
          <tr key={key}>
            <td className="px-2 py-1.5 font-mono text-slate-900">{line.platformSku}</td>
            <td className="px-2 py-1.5 text-slate-700">
              {line.platformProductName}
              {line.variationName ? (
                <span className="text-slate-500"> / {line.variationName}</span>
              ) : null}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
              {qty(line.quantity)}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
              {baht(line.unitPrice)}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">
              {baht(line.lineTotal)}
            </td>
            <td className="px-2 py-1.5">
              <MatchSourceBadge source={line.matchSource} />
            </td>
            <td className="px-2 py-1.5">
              {line.variantSku ? (
                <span className="text-slate-700">
                  <span className="font-mono">{line.variantSku}</span>
                  <span className="text-slate-500"> / {line.variantName}</span>
                </span>
              ) : (
                <span className="font-medium text-rose-600">ยังไม่จับคู่</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PreviewOrdersTable({ orders }: { orders: PreviewOrder[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <TableWrap>
      <Table>
        <Thead>
          <Tr>
            <Th className="w-8" />
            <Th>เลขที่ออเดอร์</Th>
            <Th>สถานะ</Th>
            <Th>เวลาสั่งซื้อ</Th>
            <Th>ผู้ซื้อ</Th>
            <Th numeric>รายการ</Th>
            <Th numeric>ยอดรวม</Th>
          </Tr>
        </Thead>
        <Tbody>
          {orders.map((order) => {
            const open = openIds.has(order.externalOrderId);
            const hasUnmatched = order.lines.some((line) => line.matchSource === 'unmatched');

            return [
              <Tr
                key={order.externalOrderId}
                clickable
                onClick={() => toggle(order.externalOrderId)}
              >
                <Td className="text-slate-400">
                  {open ? (
                    <ChevronDown className="size-4" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4" aria-hidden />
                  )}
                </Td>
                <Td className="font-mono text-xs text-slate-900">{order.externalOrderId}</Td>
                <Td>
                  <OrderStatusBadge status={order.status} />
                </Td>
                <Td className="whitespace-nowrap text-slate-600">
                  {formatDateTime(order.orderedAt)}
                </Td>
                <Td className="text-slate-600">{order.buyerName ?? '-'}</Td>
                <Td numeric>
                  <span className={hasUnmatched ? 'font-medium text-rose-600' : undefined}>
                    {qty(order.lines.length)}
                  </span>
                </Td>
                <Td numeric className="font-medium text-slate-900">
                  {baht(order.grandTotal)}
                </Td>
              </Tr>,
              open ? (
                <tr key={`${order.externalOrderId}-lines`} className="bg-slate-50/70">
                  <td colSpan={7} className="px-3 py-2">
                    <LineRows lines={order.lines} />
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
