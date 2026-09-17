'use client';

/**
 * /inventory/[variantId] - everything known about one variant: live balances,
 * the FIFO layers behind its cost and the movement trail that produced them.
 */

import { CostGate, CostLockedNote, CostValue } from '@/components/cost-value';
import { BundleComponentsCard } from '@/components/inventory/bundle-components-card';
import { VariantLotsTable, lotsStockValue } from '@/components/inventory/variant-lots-table';
import { VariantMovementsCard } from '@/components/inventory/variant-movements-card';
import { useRole } from '@/components/role-provider';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
  ErrorState,
  PageHeader,
  StatCard,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { baht, qty } from '@/lib/format';
import { VARIANT_KIND_LABELS } from '@/lib/labels';
import { useApi } from '@/lib/use-api';
import { ArrowLeft, Boxes, Layers, Lock, PackageCheck, ShoppingCart, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

function BackLink() {
  return (
    <Link
      href="/inventory"
      className="inline-flex items-center gap-1 text-slate-500 hover:text-emerald-600"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      กลับไปที่สต็อกสินค้า
    </Link>
  );
}

function LotsLockedCard() {
  return (
    <Card>
      <CardHeader title="ล็อตต้นทุนแบบ FIFO" description="ข้อมูลส่วนนี้จำกัดตามตำแหน่งงาน" />
      <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Lock className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-medium text-slate-900">ต้นทุนถูกซ่อนไว้</p>
        <CostLockedNote />
      </CardBody>
    </Card>
  );
}

export default function VariantDetailPage() {
  const { role } = useRole();
  // useParams can be typed as nullable depending on the Next release, so read
  // it defensively rather than asserting.
  const params = useParams<{ variantId: string }>();
  const variantId = params?.variantId ?? '';

  const { data, error, loading, reload } = useApi(
    () => api.getVariant(variantId),
    [variantId, role],
  );

  const variant = data?.variant;
  const isLow = data ? data.onHand <= (variant?.lowStockThreshold ?? 0) : false;

  return (
    <>
      <PageHeader
        eyebrow={<BackLink />}
        title={variant?.name ?? 'รายละเอียดสินค้า'}
        description={
          variant ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{variant.sku}</span>
              <span className="text-slate-300">/</span>
              <span>หน่วย {variant.unit}</span>
              <Badge tone={variant.kind === 'bundle' ? 'purple' : 'neutral'}>
                {VARIANT_KIND_LABELS[variant.kind]}
              </Badge>
              {isLow ? <Badge tone="warning">ใกล้หมด</Badge> : null}
            </span>
          ) : error ? (
            'ไม่สามารถโหลดข้อมูลสินค้านี้ได้'
          ) : (
            'กำลังโหลดข้อมูลสินค้า'
          )
        }
      />

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : null}

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <Card>
            <TableSkeleton rows={5} cols={6} />
          </Card>
        </div>
      ) : null}

      {data && variant ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="คงเหลือ"
              value={qty(data.onHand)}
              hint={`จุดเตือนสต็อกต่ำ ${qty(variant.lowStockThreshold)} ${variant.unit}`}
              tone={isLow ? 'warning' : 'default'}
              icon={<PackageCheck className="size-4" aria-hidden />}
            />
            <StatCard
              label="จอง"
              value={qty(data.reserved)}
              hint="ถูกกันไว้ให้ออเดอร์ที่ยังไม่ได้จัดส่ง"
              icon={<ShoppingCart className="size-4" aria-hidden />}
            />
            <StatCard
              label="พร้อมขาย"
              value={qty(data.available)}
              hint="คงเหลือลบยอดจอง"
              tone="positive"
              icon={<Boxes className="size-4" aria-hidden />}
            />
            {/* Stock value is summed from the open FIFO layers. Without the
                cost:read permission the API strips `lots`, so the value is
                undefined and <CostValue> renders the mask. */}
            <StatCard
              label="มูลค่าสต็อก"
              value={<CostValue value={lotsStockValue(data.lots)} />}
              hint="รวมจากล็อตที่ยังเหลืออยู่"
              icon={<Wallet className="size-4" aria-hidden />}
            />
          </div>

          <Card>
            <CardHeader title="ข้อมูลสินค้า" description="ค่าตั้งต้นที่ใช้กับทุกช่องทางขาย" />
            <CardBody className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">ราคาขาย</p>
                <p className="mt-0.5 font-medium tabular-nums text-slate-900">
                  {baht(variant.sellingPrice)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">จุดเตือนสต็อกต่ำ</p>
                <p className="mt-0.5 font-medium tabular-nums text-slate-900">
                  {qty(variant.lowStockThreshold)} {variant.unit}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">บาร์โค้ด</p>
                <p className="mt-0.5 font-mono text-xs text-slate-700">{variant.barcode ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">รหัสสินค้า</p>
                <p className="mt-0.5 font-mono text-xs text-slate-700">{variant.id}</p>
              </div>
            </CardBody>
          </Card>

          {variant.kind === 'bundle' ? (
            <BundleComponentsCard components={variant.components ?? []} unit={variant.unit} />
          ) : null}

          <CostGate fallback={<LotsLockedCard />}>
            <Card>
              <CardHeader
                title="ล็อตต้นทุนแบบ FIFO"
                description="เรียงตามลำดับที่จะถูกตัดออกก่อน ล็อตเก่าที่สุดอยู่บนสุด"
                action={
                  <Badge tone="info">
                    <Layers className="size-3" aria-hidden />
                    มูลค่ารวม <CostValue value={lotsStockValue(data.lots)} />
                  </Badge>
                }
              />
              <VariantLotsTable lots={data.lots ?? []} />
            </Card>
          </CostGate>

          <VariantMovementsCard variantId={variantId} />
        </div>
      ) : null}
    </>
  );
}
