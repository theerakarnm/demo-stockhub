'use client';

/**
 * /orders - every sales order in one list, whatever channel it came from.
 *
 * Marketplace rows arrive through the import flow, POS and wholesale rows are
 * opened on /orders/new. The screen only renders what the API returns; gross
 * profit is the one derived number and it exists only when the role may read
 * cost.
 */

import { CostLockedNote, CostValue } from '@/components/cost-value';
import { ChannelBadge, OrderStatusBadge } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
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
  buttonClass,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Order } from '@/lib/api-types';
import { baht, formatDateTime, qty } from '@/lib/format';
import { orderStatusOptions } from '@/lib/labels';
import { useApi } from '@/lib/use-api';
import type { OrderStatus } from '@stockhub/core';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const PAGE_SIZE = 25;

/**
 * Gross profit is total - cogs, and `cogs` is stripped by the API for roles
 * without cost:read. Returning undefined keeps <CostValue> in charge of what
 * the cell shows.
 */
const grossProfitOf = (order: Order): number | undefined =>
  order.cogs === undefined ? undefined : order.total - order.cogs;

export default function OrdersPage() {
  const { role, hasPermission, canReadCost } = useRole();
  const [channelId, setChannelId] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  // Keyed-set paging: the API returns nextCursor, the demo grows the page size.
  // TODO(template): switch to cursor + append once the list gets long enough to need it.
  const [limit, setLimit] = useState(PAGE_SIZE);

  const channels = useApi(() => api.getChannels(), [role]);
  const orders = useApi(
    () =>
      api.getOrders({
        channelId: channelId || undefined,
        status: status || undefined,
        limit,
      }),
    [channelId, status, limit, role],
  );

  const channelOptions = (channels.data ?? []).map((channel) => ({
    value: channel.id,
    label: channel.name,
  }));

  const rows = orders.data?.items ?? [];
  const isEmpty = !orders.loading && !orders.error && rows.length === 0;

  return (
    <>
      <PageHeader
        title="ออเดอร์"
        description="ออเดอร์จากทุกช่องทางขาย รวมถึงบิลหน้าร้านและบิลขายส่ง"
        actions={
          hasPermission('order:create') ? (
            <Link href="/orders/new" className={buttonClass('primary', 'md')}>
              <ShoppingCart className="size-4" aria-hidden />
              เปิดบิลขายหน้าร้าน
            </Link>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-4 py-3">
          <div className="w-56">
            <Select
              label="ช่องทางขาย"
              name="channelId"
              placeholder="ทุกช่องทาง"
              options={channelOptions}
              value={channelId}
              onChange={(event) => {
                setChannelId(event.target.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </div>
          <div className="w-56">
            <Select
              label="สถานะ"
              name="status"
              placeholder="ทุกสถานะ"
              options={orderStatusOptions}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatus | '');
                setLimit(PAGE_SIZE);
              }}
            />
          </div>
        </div>

        {orders.loading && !orders.data ? <TableSkeleton rows={8} cols={7} /> : null}
        {orders.error ? <ErrorState error={orders.error} onRetry={orders.reload} /> : null}
        {isEmpty ? (
          <EmptyState
            title="ยังไม่มีออเดอร์ตามเงื่อนไขนี้"
            description="ลองล้างตัวกรอง หรือนำเข้าไฟล์ออเดอร์จากมาร์เก็ตเพลสก่อน"
            icon={<ShoppingCart className="size-5" aria-hidden />}
          />
        ) : null}

        {!orders.error && rows.length > 0 ? (
          <TableWrap>
            <Table>
              <Thead>
                <Tr>
                  <Th>เลขที่ออเดอร์</Th>
                  <Th>ช่องทาง</Th>
                  <Th>ลูกค้า</Th>
                  <Th>วันที่</Th>
                  <Th numeric>จำนวนรายการ</Th>
                  <Th numeric>ยอดรวม</Th>
                  <Th numeric>ต้นทุน</Th>
                  <Th numeric>กำไรขั้นต้น</Th>
                  <Th>สถานะ</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((order) => (
                  <Tr key={order.id}>
                    <Td className="font-mono text-xs text-slate-900">
                      {order.externalOrderId ?? order.id}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ChannelBadge kind={order.channelKind} />
                        <span className="text-xs text-slate-500">{order.channelName}</span>
                      </div>
                    </Td>
                    <Td>{order.customerName ?? '-'}</Td>
                    <Td className="whitespace-nowrap text-slate-600">
                      {formatDateTime(order.orderedAt)}
                    </Td>
                    <Td numeric>{qty(order.lineCount)}</Td>
                    <Td numeric className="font-medium text-slate-900">
                      {baht(order.total)}
                    </Td>
                    <Td numeric>
                      <CostValue value={order.cogs} />
                    </Td>
                    <Td numeric>
                      <CostValue value={grossProfitOf(order)} />
                    </Td>
                    <Td>
                      <OrderStatusBadge status={order.status} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        ) : null}

        {orders.data?.nextCursor ? (
          <div className="flex justify-center border-t border-slate-200 px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              loading={orders.loading}
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
            >
              โหลดเพิ่ม
            </Button>
          </div>
        ) : null}
      </Card>

      {canReadCost ? null : <CostLockedNote className="mt-3" />}
    </>
  );
}
