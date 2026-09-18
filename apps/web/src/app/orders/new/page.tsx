'use client';

/**
 * /orders/new - open a bill by hand (counter sale or wholesale).
 *
 * The screen collects lines and posts them to POST /api/v1/orders. It never
 * touches stock or cost itself: the API runs the FIFO consume inside one
 * transaction and answers with the saved order, and the page redirects to the
 * bill's own detail page (/orders/[id]) where cancel / return / print live.
 */

import { mergeAvailability } from '@/components/orders/availability';
import type { CartLine, CartLinePatch } from '@/components/orders/cart';
import { CartTable, cartTotalOf, discountOf, unitPriceOf } from '@/components/orders/cart';
import type { ManualChannelKind } from '@/components/orders/channel-kind-toggle';
import { ChannelKindToggle } from '@/components/orders/channel-kind-toggle';
import { CustomerPicker } from '@/components/orders/customer-picker';
import { OrderSummaryCard } from '@/components/orders/order-summary-card';
import { ProductPicker } from '@/components/orders/product-picker';
import { repriceLines } from '@/components/orders/reprice';
import { useLiveAvailability } from '@/components/orders/use-live-availability';
import { PermissionGate } from '@/components/permission-gate';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  buttonClass,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { pricingApi } from '@/lib/api-pricing';
import type { CreateOrderInput, StockRow } from '@/lib/api-types';
import type { CustomerView } from '@/lib/api-types-pricing';
import { useMutation } from '@/lib/use-api';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Shown instead of the bill when the role may not open one (e.g. stock staff). */
function NoAccessCard() {
  return (
    <>
      <PageHeader title="เปิดบิลขาย" description="บันทึกการขายหน้าร้านหรือขายส่ง" />
      <Card>
        <EmptyState
          title="ตำแหน่งงานของคุณไม่สามารถเปิดบิลขายได้"
          description="การเปิดบิลต้องมีสิทธิ์ order:create ลองสลับตำแหน่งงานที่มุมขวาบน หรือติดต่อผู้ดูแลระบบ"
          action={
            <Link href="/orders" className={buttonClass('outline', 'sm')}>
              กลับไปหน้าออเดอร์
            </Link>
          }
        />
      </Card>
    </>
  );
}

function BillingForm() {
  const [channelKind, setChannelKind] = useState<ManualChannelKind>('pos');
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerView | null>(null);

  const router = useRouter();
  const createOrder = useMutation((input: CreateOrderInput) => api.createOrder(input));

  const addLine = useCallback((row: StockRow) => {
    setLines((current) => {
      if (current.some((line) => line.variantId === row.variantId)) return current;
      return [
        ...current,
        {
          variantId: row.variantId,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          available: row.available,
          quantity: 1,
          // Selling price arrives in satang; the input works in baht.
          priceBaht: (row.sellingPrice / 100).toFixed(2),
          discountBaht: '0',
          priceTouched: false,
        },
      ];
    });
  }, []);

  const patchLine = useCallback((variantId: string, patch: CartLinePatch) => {
    setLines((current) =>
      current.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line)),
    );
  }, []);

  const removeLine = useCallback((variantId: string) => {
    setLines((current) => current.filter((line) => line.variantId !== variantId));
  }, []);

  // Stock keeps moving while the bill is open (an import can apply, another
  // till can sell), so the cart re-reads each variant's available balance.
  const balances = useLiveAvailability(lines.map((line) => line.variantId));
  useEffect(() => {
    if (balances.size === 0) return;
    setLines((current) => mergeAvailability(current, balances));
  }, [balances]);

  // Reprice every untouched line whenever the picked customer changes or a
  // line is added. Touched lines are left alone by repriceLines.
  const variantIds = lines.map((line) => line.variantId).join(',');
  const customerId = customer?.id;
  useEffect(() => {
    if (variantIds === '') return;
    let cancelled = false;
    pricingApi
      .resolve(variantIds.split(','), customerId ? { customerId } : {})
      .then((resolutions) => {
        if (cancelled) return;
        setLines((current) => repriceLines(current, resolutions));
      })
      .catch(() => {
        // A failed resolve keeps the current prices; the cashier can still type.
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, variantIds]);

  const total = useMemo(() => cartTotalOf(lines), [lines]);
  const unitCount = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);
  const canSubmit = lines.length > 0 && lines.every((line) => unitPriceOf(line) > 0);

  const submit = useCallback(() => {
    void createOrder
      .run({
        channelKind,
        customerName: customerName.trim() || undefined,
        customerId: customer?.id,
        note: note.trim() || undefined,
        lines: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: unitPriceOf(line),
          discount: discountOf(line),
        })),
      })
      // The bill's own page is the single place that shows, cancels, returns
      // and prints it - land there instead of a local success panel.
      .then((created) => {
        if (created) router.push(`/orders/${created.id}`);
      });
  }, [channelKind, createOrder, customer, customerName, lines, note, router]);

  return (
    <>
      <PageHeader
        title="เปิดบิลขาย"
        description="บันทึกการขายหน้าร้านหรือขายส่ง ระบบจะตัดสต็อกจากคลังกลางทันที"
        eyebrow={
          <Link href="/orders" className="hover:text-slate-700">
            ออเดอร์
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="ข้อมูลบิล" description="เลือกประเภทการขายและระบุลูกค้า (ถ้ามี)" />
            <CardBody className="space-y-4">
              <ChannelKindToggle value={channelKind} onChange={setChannelKind} />
              <div>
                <p className="mb-1 block text-xs font-medium text-slate-600">ลูกค้าประจำ</p>
                <CustomerPicker
                  customer={customer}
                  onPick={setCustomer}
                  onClear={() => setCustomer(null)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="ชื่อลูกค้า (ไม่บังคับ)"
                  name="customerName"
                  placeholder="ใส่เองได้ ถ้าไม่ได้เลือกลูกค้าประจำ"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
                <Input
                  label="หมายเหตุ"
                  name="note"
                  placeholder="เช่น รับของเอง / ส่งพรุ่งนี้"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="เลือกสินค้า" description="ค้นหาแล้วกดเพิ่มลงบิล" />
            <CardBody>
              <ProductPicker selectedIds={lines.map((line) => line.variantId)} onAdd={addLine} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="รายการในบิล"
              description="แก้จำนวน ราคา และส่วนลดได้ก่อนบันทึก"
              action={
                lines.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setLines([])}>
                    ล้างรายการ
                  </Button>
                ) : null
              }
            />
            {lines.length === 0 ? (
              <EmptyState
                title="ยังไม่มีสินค้าในบิล"
                description="ค้นหาสินค้าด้านบนแล้วกดปุ่มเพิ่ม เพื่อเริ่มออกบิล"
                icon={<ShoppingCart className="size-5" aria-hidden />}
              />
            ) : (
              <CartTable lines={lines} onPatch={patchLine} onRemove={removeLine} />
            )}
          </Card>
        </div>

        <div className="lg:col-span-1">
          <OrderSummaryCard
            lineCount={lines.length}
            unitCount={unitCount}
            total={total}
            pending={createOrder.pending}
            canSubmit={canSubmit && !createOrder.pending}
            onSubmit={submit}
            error={createOrder.error}
          />
        </div>
      </div>
    </>
  );
}

export default function NewOrderPage() {
  return (
    <PermissionGate permission="order:create" fallback={<NoAccessCard />}>
      <BillingForm />
    </PermissionGate>
  );
}
