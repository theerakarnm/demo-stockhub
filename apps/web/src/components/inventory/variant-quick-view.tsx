'use client';

/**
 * Drawer body for one stock row. Mounted with the selected variant id as key,
 * so no request is made while no row is selected and switching rows starts
 * from a clean loading state.
 */

import { CostGate, CostLockedNote, CostValue } from '@/components/cost-value';
import { useRole } from '@/components/role-provider';
import { Badge, ErrorState, Skeleton, buttonClass } from '@/components/ui';
import { api } from '@/lib/api-client';
import { baht, qty } from '@/lib/format';
import { VARIANT_KIND_LABELS } from '@/lib/labels';
import { useApi } from '@/lib/use-api';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { VariantLotsTable, lotsStockValue } from './variant-lots-table';

function NumberTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          accent ? 'text-emerald-600' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function VariantQuickView({ variantId }: { variantId: string }) {
  const { role } = useRole();
  const { data, error, loading, reload } = useApi(
    () => api.getVariant(variantId),
    [variantId, role],
  );

  if (loading && !data) {
    return (
      <div className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { variant } = data;

  return (
    <div className="space-y-5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-mono">{variant.sku}</span>
        <span>/</span>
        <span>หน่วย {variant.unit}</span>
        {variant.kind === 'bundle' ? (
          <Badge tone="purple">{VARIANT_KIND_LABELS.bundle}</Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumberTile label="คงเหลือ" value={qty(data.onHand)} />
        <NumberTile label="จอง" value={qty(data.reserved)} />
        <NumberTile label="พร้อมขาย" value={qty(data.available)} accent />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <span className="text-slate-500">ราคาขาย</span>
        <span className="font-medium tabular-nums text-slate-900">
          {baht(variant.sellingPrice)}
        </span>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <span className="text-slate-500">มูลค่าสต็อกคงเหลือ</span>
        <CostValue value={lotsStockValue(data.lots)} className="font-medium text-slate-900" />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          ล็อตต้นทุนแบบ FIFO
        </p>
        <CostGate
          fallback={
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6">
              <CostLockedNote className="justify-center" />
            </div>
          }
        >
          <div className="rounded-lg border border-slate-200">
            <VariantLotsTable lots={data.lots ?? []} />
          </div>
        </CostGate>
      </div>

      <Link href={`/inventory/${variant.id}`} className={buttonClass('outline', 'sm', 'w-full')}>
        ดูรายละเอียดทั้งหมด
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
