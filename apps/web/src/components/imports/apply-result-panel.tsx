/**
 * Shown after api.applyImport() succeeds. This is the payoff slide of the demo:
 * one file in, stock movements out.
 */

import { CostValue } from '@/components/cost-value';
import { buttonClass } from '@/components/ui';
import type { ApplyImportResult } from '@/lib/api-types';
import { qty } from '@/lib/format';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

function ResultStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function ApplyResultPanel({ result }: { result: ApplyImportResult }) {
  return (
    <section className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">นำเข้าและตัดสต็อกเรียบร้อย</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            ออเดอร์ถูกบันทึกและสต็อกในคลังกลางถูกตัดตามจำนวนที่ขายจริงแล้ว
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ResultStat label="ความเคลื่อนไหวสต็อกที่สร้าง" value={qty(result.movementsCreated)} />
        <ResultStat label="ออเดอร์ที่บันทึก" value={qty(result.ordersApplied)} />
        <ResultStat label="ต้นทุนขายรวม (COGS)" value={<CostValue value={result.cogs} />} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/movements" className={buttonClass('primary', 'sm')}>
          ดูความเคลื่อนไหวสต็อก
        </Link>
        <Link href="/orders" className={buttonClass('outline', 'sm')}>
          ดูออเดอร์ที่นำเข้า
        </Link>
      </div>
    </section>
  );
}
