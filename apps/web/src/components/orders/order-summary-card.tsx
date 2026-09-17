'use client';

/**
 * Sticky bill summary. It shows what the cashier typed (quantity and revenue)
 * and leaves every cost figure blank on purpose: unit cost is decided by the
 * FIFO engine inside the transaction that saves the bill, so the UI must not
 * guess it. The real numbers arrive in the createOrder response.
 */

import { CostValue } from '@/components/cost-value';
import { useRole } from '@/components/role-provider';
import { Button, Card, CardBody, CardFooter, CardHeader } from '@/components/ui';
import type { ApiError } from '@/lib/api-error';
import { baht, qty } from '@/lib/format';
import { Lock } from 'lucide-react';

interface OrderSummaryCardProps {
  lineCount: number;
  unitCount: number;
  total: number;
  pending: boolean;
  /** False while the cart is empty or a line is invalid. */
  canSubmit: boolean;
  onSubmit: () => void;
  error: ApiError | null;
}

/** Turns the API failure codes this screen can hit into one clear Thai line. */
const errorMessage = (error: ApiError): string => {
  if (error.code === 'insufficient_stock') {
    return `สต็อกไม่พอสำหรับบิลนี้ ${error.message}`;
  }
  if (error.code === 'validation_error') {
    return `ข้อมูลบิลไม่ถูกต้อง ${error.message}`;
  }
  if (error.code === 'forbidden') {
    return 'ตำแหน่งงานของคุณไม่มีสิทธิ์เปิดบิลขาย';
  }
  return error.message;
};

export function OrderSummaryCard({
  lineCount,
  unitCount,
  total,
  pending,
  canSubmit,
  onSubmit,
  error,
}: OrderSummaryCardProps) {
  const { canReadCost } = useRole();

  return (
    <Card className="sticky top-4">
      <CardHeader title="สรุปบิล" description="ตรวจสอบก่อนบันทึก" />
      <CardBody className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">จำนวนรายการ</span>
          <span className="tabular-nums text-slate-900">{qty(lineCount)} รายการ</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">จำนวนหน่วยรวม</span>
          <span className="tabular-nums text-slate-900">{qty(unitCount)} หน่วย</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="font-medium text-slate-700">ยอดรวม</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900">{baht(total)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">ต้นทุนรวม</span>
          {/* Cost is undefined until the API answers: FIFO decides which lots are consumed. */}
          <CostValue value={undefined} fallback="คำนวณหลังบันทึก" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">กำไรขั้นต้น</span>
          <CostValue value={undefined} fallback="คำนวณหลังบันทึก" />
        </div>

        {canReadCost ? (
          <p className="pt-1 text-xs text-slate-500">
            ต้นทุนและกำไรคำนวณด้วยวิธี FIFO ตอนบันทึกบิล จึงยังว่างอยู่ในขั้นนี้
          </p>
        ) : (
          <p className="flex items-center gap-1.5 pt-1 text-xs text-slate-500">
            <Lock className="size-3" aria-hidden />
            ข้อมูลต้นทุนถูกซ่อนตามตำแหน่งงานของคุณ
          </p>
        )}

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage(error)}
          </p>
        ) : null}
      </CardBody>
      <CardFooter>
        <Button
          className="w-full"
          size="lg"
          loading={pending}
          disabled={!canSubmit}
          title={canSubmit ? 'บันทึกบิลและตัดสต็อก' : 'เพิ่มสินค้าอย่างน้อย 1 รายการก่อน'}
          onClick={onSubmit}
        >
          บันทึกบิล
        </Button>
      </CardFooter>
    </Card>
  );
}
