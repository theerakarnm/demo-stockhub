'use client';

/**
 * /orders/[id] - one bill: header, lines, totals, and the actions the status
 * allows. Cancel and return POST to the API, which reverses the exact FIFO
 * consumption inside one transaction; this page only renders the outcome and
 * re-reads the bill afterwards.
 */

import { CostValue } from '@/components/cost-value';
import {
  ChannelBadge,
  MovementReasonBadge,
  OrderStatusBadge,
  QtyDelta,
} from '@/components/domain-badges';
import { CancelOrderDialog } from '@/components/orders/cancel-order-dialog';
import { ReturnOrderDialog } from '@/components/orders/return-order-dialog';
import { PermissionGate } from '@/components/permission-gate';
import { useRole } from '@/components/role-provider';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
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
import type { ApiError } from '@/lib/api-error';
import { customersApi } from '@/lib/api-pricing';
import type { FeeSource, Movement, Order, ReturnOrderLineInput } from '@/lib/api-types';
import { baht, formatDateTime, money, qty } from '@/lib/format';
import { useApi, useMutation } from '@/lib/use-api';
import type { OrderStatus } from '@stockhub/core';
import { Ban, Printer, ReceiptText, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Statuses the API accepts for POST /orders/:id/cancel. */
const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
];

/** A return needs units that physically left: shipped or delivered only. */
const RETURNABLE_STATUSES: readonly OrderStatus[] = ['shipped', 'delivered'];

/** Thai copy for each fee source, so a manager can tell a typed fee from a
    channel default at a glance when auditing a bill's profit. */
const FEE_SOURCE_LABELS: Record<FeeSource, string> = {
  none: 'ไม่มี',
  manual: 'ตั้งเอง',
  channel_default: 'ตามช่องทางขาย',
  exported: 'จากแพลตฟอร์ม',
};

/** One cancelled/returned order's ledger result, so the user sees stock go back. */
function MovementsBanner({ title, movements }: { title: string; movements: readonly Movement[] }) {
  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
      <p className="text-sm font-medium text-emerald-900">{title}</p>
      {movements.length === 0 ? (
        <p className="mt-1 text-xs text-emerald-800/80">
          ไม่มีการเคลื่อนไหวของสต็อก เพราะบิลนี้ยังไม่เคยตัดสต็อก
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {movements.slice(0, 6).map((movement) => (
            <li
              key={movement.id}
              className="flex flex-wrap items-center gap-2 text-xs text-emerald-900"
            >
              <MovementReasonBadge reason={movement.reason} />
              <span className="font-mono">{movement.sku}</span>
              <span>{movement.name}</span>
              <QtyDelta value={movement.qtyDelta} />
              {movement.note ? <span className="text-emerald-800/70">{movement.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Status note for bills that can no longer be changed. */
function StatusNote({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
        บิลนี้ถูกยกเลิกแล้ว ระบบคืนสต็อกเข้าคลังกลางเรียบร้อย
      </p>
    );
  }
  if (status === 'returned') {
    return (
      <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700">
        ลูกค้าได้คืนสินค้าครบทุกรายการแล้ว
      </p>
    );
  }
  return null;
}

function BillLinesCard({ order }: { order: Order }) {
  return (
    <Card>
      <CardHeader title="รายการในบิล" description={`รวม ${qty(order.lines.length)} รายการ`} />
      {order.lines.length === 0 ? (
        <EmptyState
          title="ไม่มีรายการสินค้าในบิลนี้"
          description="ออเดอร์จากแพลตฟอร์มอาจถูกอ่านเป็นแถวปัญหา ตรวจสอบได้ที่หน้านำเข้าออเดอร์"
        />
      ) : (
        <TableWrap>
          <Table>
            <Thead>
              <Tr>
                <Th>สินค้า</Th>
                <Th numeric>จำนวน</Th>
                <Th numeric>ราคา/หน่วย</Th>
                <Th numeric>ส่วนลด</Th>
                <Th numeric>ยอดรวมรายการ</Th>
                <Th numeric>ต้นทุนรวม</Th>
              </Tr>
            </Thead>
            <Tbody>
              {order.lines.map((line) => (
                <Tr key={line.id}>
                  <Td>
                    <p className="font-medium text-slate-900">{line.name}</p>
                    <p className="font-mono text-xs text-slate-500">{line.sku}</p>
                  </Td>
                  <Td numeric>{qty(line.quantity)}</Td>
                  <Td numeric>{baht(line.unitPrice)}</Td>
                  <Td numeric>{line.discount > 0 ? baht(line.discount) : '-'}</Td>
                  <Td numeric className="font-medium text-slate-900">
                    {baht(line.lineTotal)}
                  </Td>
                  <Td numeric>
                    {/* Stripped by the API for roles without cost:read; the
                        bill itself never needs it - it is management info. */}
                    <CostValue value={line.totalCost} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}

function BillTotalsCard({ order, onEditFee }: { order: Order; onEditFee?: () => void }) {
  return (
    <Card>
      <CardHeader title="สรุปยอด" description="ทั้งหมดเป็นเงินรวมสุทธิหลังหักส่วนลด" />
      <CardBody className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">ยอดรวมสุทธิ</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900">
            {baht(order.grandTotal)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">ต้นทุนขาย (FIFO)</span>
          <CostValue value={order.cogs} />
        </div>
        {/* Fee override is management info, so only cost:write sees the row and
            the edit button; the API strips the fields for everyone else anyway. */}
        <PermissionGate permission="cost:write">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">ค่าธรรมเนียมแพลตฟอร์ม</span>
            <span className="flex items-center gap-2">
              <CostValue value={order.platformFee} />
              {order.feeSource !== undefined ? (
                <span className="text-xs text-slate-400">{FEE_SOURCE_LABELS[order.feeSource]}</span>
              ) : null}
              {onEditFee ? (
                <Button variant="outline" size="sm" onClick={onEditFee}>
                  แก้ไข
                </Button>
              ) : null}
            </span>
          </div>
        </PermissionGate>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">กำไรขั้นต้น</span>
          <CostValue
            value={order.margin}
            fallback={order.cogs === undefined ? undefined : baht(order.grandTotal - order.cogs)}
          />
        </div>
      </CardBody>
    </Card>
  );
}

interface FeeEditDialogProps {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  error: ApiError | null;
  /** Fee currently on the bill, in satang; the input starts from it. */
  currentFee?: number;
  /** Called with the fee in satang once the user confirms. */
  onConfirm: (fee: number) => void;
}

/** Fee override dialog. The input is baht, the wire format is satang: the
    submit conversion is Math.round(Number(value) * 100), the same integer
    satang the API schema stores. */
function FeeEditDialog({
  open,
  onClose,
  pending,
  error,
  currentFee,
  onConfirm,
}: FeeEditDialogProps) {
  const [value, setValue] = useState('');

  // Re-seed on every open so the input shows the fee currently on the bill,
  // not whatever the user typed the last time around.
  useEffect(() => {
    if (open) setValue(currentFee === undefined ? '' : money(currentFee));
  }, [open, currentFee]);

  // The API schema wants a nonnegative integer satang amount; mirror the
  // nonnegative/finite part here so the button mirrors what the API accepts.
  // The seed (and any pasted value) can carry a locale comma: drop it before
  // Number() so a prefilled amount stays submittable as-is.
  const parsed = Number(value.replace(/[,\s]/g, ''));
  const ready = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;

  const close = (): void => {
    setValue('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="แก้ไขค่าธรรมเนียมแพลตฟอร์ม"
      description="ตั้งค่าธรรมเนียมของบิลนี้เอง หน่วยเป็นบาท"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            ปิด
          </Button>
          <Button
            loading={pending}
            disabled={!ready}
            onClick={() => onConfirm(Math.round(parsed * 100))}
          >
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <Input
          label="ค่าธรรมเนียมแพลตฟอร์ม (บาท)"
          name="platformFee"
          inputMode="decimal"
          placeholder="เช่น 35 หรือ 35.50"
          hint={currentFee !== undefined ? `ปัจจุบัน ${baht(currentFee)}` : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error.message}</p>
        ) : null}
      </div>
    </Dialog>
  );
}

function BillInfoCard({
  order,
  customer,
}: {
  order: Order;
  customer: { phone?: string; priceTierName?: string } | null;
}) {
  return (
    <Card>
      <CardHeader title="ข้อมูลบิล" description="ลูกค้าและช่องทางที่ออกบิล" />
      <CardBody className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">ลูกค้า</span>
          <span className="text-right text-slate-900">
            {order.customerName ?? 'ลูกค้าหน้าร้าน'}
            {customer?.phone ? (
              <span className="block font-mono text-xs text-slate-500">{customer.phone}</span>
            ) : null}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">ระดับราคา</span>
          {/* '-' not "ปลีก": a role without customer:read gets no customer
              record, so the tier is unknown rather than the default. */}
          <span className="text-right text-slate-900">{customer?.priceTierName ?? '-'}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">ช่องทาง</span>
          <span className="text-right">
            <ChannelBadge kind={order.channelKind} label={order.channelName} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">วันที่ออกบิล</span>
          <span className="text-right text-slate-900">{formatDateTime(order.orderedAt)}</span>
        </div>
      </CardBody>
    </Card>
  );
}

export default function OrderDetailPage() {
  const { role, hasPermission } = useRole();
  // Client component: read the route param with useParams, not with props.
  // useParams is typed as nullable in some Next releases, so read it defensively.
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';

  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);

  const { data, error, loading, reload } = useApi(() => api.getOrder(orderId), [orderId, role]);

  // Tier name and phone live on the customer record, not on the order wire
  // shape. Fetch it only when the bill has one AND the role may read customers
  // (stock_staff cannot); a failure degrades to the order's own name.
  const customerId = data?.customerId;
  const canReadCustomers = hasPermission('customer:read');
  const customer = useApi(
    () =>
      customerId && canReadCustomers
        ? customersApi.get(customerId).catch(() => null)
        : Promise.resolve(null),
    [customerId, canReadCustomers, role],
  );

  const cancel = useMutation((reason: string) => api.cancelOrder(orderId, reason));
  const doReturn = useMutation((lines: ReturnOrderLineInput[]) => api.returnOrder(orderId, lines));
  const setFee = useMutation((fee: number) => api.setOrderFee(orderId, fee));

  const status = data?.status;
  const canCancel = status !== undefined && CANCELLABLE_STATUSES.includes(status);
  const canReturn = status !== undefined && RETURNABLE_STATUSES.includes(status);
  const busy = cancel.pending || doReturn.pending;

  const closeDialogs = (): void => {
    setCancelOpen(false);
    setReturnOpen(false);
  };

  const confirmCancel = (reason: string): void => {
    void cancel.run(reason).then((movements) => {
      if (movements === null) return;
      closeDialogs();
      reload();
    });
  };

  const confirmReturn = (lines: ReturnOrderLineInput[]): void => {
    void doReturn.run(lines).then((movements) => {
      if (movements === null) return;
      closeDialogs();
      reload();
    });
  };

  const confirmFee = (fee: number): void => {
    void setFee.run(fee).then((updated) => {
      if (updated === null) return;
      setFeeOpen(false);
      reload();
    });
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/orders" className="inline-flex items-center gap-1 hover:text-slate-700">
            กลับไปหน้าออเดอร์
          </Link>
        }
        title={data?.externalOrderId ?? 'รายละเอียดบิล'}
        description={
          data ? (
            <span className="flex flex-wrap items-center gap-2">
              <ChannelBadge kind={data.channelKind} />
              <OrderStatusBadge status={data.status} />
              <span className="text-slate-300">/</span>
              <span>{formatDateTime(data.orderedAt)}</span>
            </span>
          ) : error ? (
            'ไม่สามารถโหลดข้อมูลบิลนี้ได้'
          ) : (
            'กำลังโหลดข้อมูลบิล'
          )
        }
        actions={
          <>
            {data ? (
              <Link
                href={`/orders/${data.id}/print`}
                className={buttonClass('outline', 'md')}
                title="เปิดหน้าพิมพ์บิล (บันทึกเป็น PDF ได้จากเบราว์เซอร์)"
              >
                <Printer className="size-4" aria-hidden />
                พิมพ์บิล
              </Link>
            ) : null}
            <PermissionGate permission="order:create">
              {canCancel ? (
                <Button variant="outline" loading={busy} onClick={() => setCancelOpen(true)}>
                  <Ban className="size-4" aria-hidden />
                  ยกเลิกบิล
                </Button>
              ) : null}
              {canReturn ? (
                <Button variant="outline" loading={busy} onClick={() => setReturnOpen(true)}>
                  <RotateCcw className="size-4" aria-hidden />
                  รับคืนสินค้า
                </Button>
              ) : null}
            </PermissionGate>
          </>
        }
      />

      {cancel.result !== null ? (
        <MovementsBanner title="ยกเลิกบิลเรียบร้อย สต็อกถูกคืนตามรายการนี้" movements={cancel.result} />
      ) : null}
      {doReturn.result !== null ? (
        <MovementsBanner title="รับคืนสินค้าเรียบร้อย ตามรายการนี้" movements={doReturn.result} />
      ) : null}

      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <CardSkeleton />
            <Card>
              <TableSkeleton rows={4} cols={5} />
            </Card>
          </div>
          <CardSkeleton />
        </div>
      ) : null}

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : null}

      {data && !error ? (
        <div className="space-y-4">
          <StatusNote status={data.status} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <BillLinesCard order={data} />
            </div>
            <div className="space-y-4">
              <BillInfoCard order={data} customer={customer.data} />
              <BillTotalsCard order={data} onEditFee={() => setFeeOpen(true)} />
              <p className="flex items-center gap-1.5 px-1 text-xs text-slate-400">
                <ReceiptText className="size-3.5" aria-hidden />
                เลขที่ออเดอร์ภายใน {data.id}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          <CancelOrderDialog
            open={cancelOpen}
            onClose={() => setCancelOpen(false)}
            pending={cancel.pending}
            error={cancel.error}
            onConfirm={confirmCancel}
          />
          <ReturnOrderDialog
            open={returnOpen}
            onClose={() => setReturnOpen(false)}
            lines={data.lines}
            pending={doReturn.pending}
            error={doReturn.error}
            onConfirm={confirmReturn}
          />
          <FeeEditDialog
            open={feeOpen}
            onClose={() => setFeeOpen(false)}
            pending={setFee.pending}
            error={setFee.error}
            currentFee={data.platformFee}
            onConfirm={confirmFee}
          />
        </>
      ) : null}
    </>
  );
}
