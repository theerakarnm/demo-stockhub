'use client';

/**
 * Goods receipt form for /inventory/receive.
 *
 * The form owns no stock math: buildReceivePayload() validates the strings and
 * converts baht to satang, and POST /api/v1/inventory/receive opens the FIFO
 * lot server side inside one transaction.
 */

import { CostLockedNote, CostValue } from '@/components/cost-value';
import { ProductPicker } from '@/components/orders/product-picker';
import { useRole } from '@/components/role-provider';
import { Button, Card, CardBody, CardHeader, Input, buttonClass } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ReceiveStockInput, StockRow } from '@/lib/api-types';
import { qty, toDateInputValue } from '@/lib/format';
import { buildReceivePayload } from '@/lib/receive-form';
import type { ReceiveFormState } from '@/lib/receive-form';
import { useMutation } from '@/lib/use-api';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

/** Fresh form state; the received date defaults to today at call time, not at module load. */
const emptyForm = (): ReceiveFormState => ({
  variantId: '',
  qty: '',
  unitCostBaht: '',
  reference: '',
  receivedAt: toDateInputValue(new Date()),
  note: '',
});

export function ReceiveForm() {
  const { hasPermission } = useRole();
  // POST /inventory/receive requires cost:write on the server too, because the
  // receipt carries the purchase cost: a role without it can never succeed, so
  // the submit stays disabled instead of inviting a 403.
  const canWriteCost = hasPermission('cost:write');

  const [picked, setPicked] = useState<StockRow | null>(null);
  const [form, setForm] = useState<ReceiveFormState>(emptyForm());
  const [formError, setFormError] = useState('');

  const receiveStock = useMutation((input: ReceiveStockInput) => api.receiveStock(input));

  const patchForm = useCallback((patch: Partial<ReceiveFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const pick = useCallback(
    (row: StockRow) => {
      setPicked(row);
      setFormError('');
      patchForm({ variantId: row.variantId });
    },
    [patchForm],
  );

  const clearPick = useCallback(() => {
    setPicked(null);
    patchForm({ variantId: '' });
  }, [patchForm]);

  const resetForm = useCallback(() => {
    setPicked(null);
    setFormError('');
    setForm(emptyForm());
    receiveStock.reset();
  }, [receiveStock]);

  const submit = useCallback(() => {
    const payload = buildReceivePayload(form);
    if ('error' in payload) {
      setFormError(payload.error);
      return;
    }
    setFormError('');
    void receiveStock.run(payload);
  }, [form, receiveStock]);

  const movement = receiveStock.result;
  if (movement) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-medium text-slate-900">รับสินค้าเข้าคลังแล้ว</p>
          <p className="font-mono text-xs text-slate-500">
            {movement.sku} - {movement.name}
          </p>
          <p className="text-sm text-slate-600">
            รับเข้า {qty(movement.qtyDelta)} {picked?.unit}
            {typeof movement.qtyAfter === 'number' ? (
              <>
                {' '}
                · คงเหลือ {qty(movement.qtyAfter)} {picked?.unit}
              </>
            ) : null}
          </p>
          <p className="text-sm text-slate-600">
            มูลค่ารวม <CostValue value={movement.totalCost} />
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button onClick={resetForm}>รับสินค้าอีกรายการ</Button>
            <Link
              href={`/inventory/${movement.variantId}`}
              className={buttonClass('outline', 'md')}
            >
              ดูสต็อกสินค้า
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="เลือกสินค้า"
          description={picked ? undefined : 'ค้นหาสินค้าที่ต้องการรับเข้าคลัง'}
          action={
            picked ? (
              <Button variant="ghost" size="sm" onClick={clearPick}>
                เปลี่ยน
              </Button>
            ) : null
          }
        />
        <CardBody>
          {picked ? (
            <div>
              <p className="text-sm font-medium text-slate-900">{picked.name}</p>
              <p className="font-mono text-xs text-slate-500">{picked.sku}</p>
            </div>
          ) : (
            <ProductPicker selectedIds={[]} onAdd={pick} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="ข้อมูลการรับ" description="ระบบจะเปิดล็อตต้นทุน FIFO ให้อัตโนมัติ" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="จำนวน"
              name="qty"
              type="number"
              min="1"
              step="1"
              placeholder="เช่น 50"
              value={form.qty}
              onChange={(event) => patchForm({ qty: event.target.value })}
            />
            {canWriteCost ? (
              <Input
                label="ต้นทุนต่อหน่วย (บาท)"
                name="unitCostBaht"
                type="number"
                min="0"
                step="0.01"
                placeholder="เช่น 120.50"
                value={form.unitCostBaht}
                onChange={(event) => patchForm({ unitCostBaht: event.target.value })}
              />
            ) : (
              <div className="flex items-end pb-2">
                <CostLockedNote />
              </div>
            )}
            <Input
              label="เลขที่ใบสั่งซื้อ/อ้างอิง"
              name="reference"
              placeholder="เช่น PO-2024-0601"
              value={form.reference}
              onChange={(event) => patchForm({ reference: event.target.value })}
            />
            <Input
              label="วันที่รับ"
              name="receivedAt"
              type="date"
              value={form.receivedAt}
              onChange={(event) => patchForm({ receivedAt: event.target.value })}
            />
            <Input
              label="หมายเหตุ"
              name="note"
              placeholder="เช่น รถขนส่งเข้าสายบ่าย"
              value={form.note}
              onChange={(event) => patchForm({ note: event.target.value })}
            />
          </div>

          {formError ? <p className="text-xs text-rose-600">{formError}</p> : null}
          {receiveStock.error ? (
            <p className="text-xs text-rose-600">{receiveStock.error.message}</p>
          ) : null}
          {!canWriteCost ? (
            <p className="text-xs text-slate-500">
              การรับสินค้าต้องระบุต้นทุน จึงต้องมีสิทธิ์ cost:write จึงกดรับสินค้าไม่ได้
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              onClick={submit}
              loading={receiveStock.pending}
              disabled={!picked || !canWriteCost}
              title={picked ? undefined : 'เลือกสินค้าก่อน'}
            >
              รับสินค้าเข้าคลัง
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
