'use client';

/**
 * /settings/price-tiers - edit every tier price in one table.
 *
 * The page itself only loads the matrix + tiers and guards `price_tier:read`
 * (the nav item is already hidden for other roles, but a direct URL must stay
 * blocked too); all editing state lives in PriceMatrix + matrix-state.ts.
 */

import { PriceMatrix } from '@/components/pricing/price-matrix';
import { useRole } from '@/components/role-provider';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui';
import { pricingApi } from '@/lib/api-pricing';
import { useApi } from '@/lib/use-api';
import { Tags } from 'lucide-react';

export default function PriceTiersPage() {
  const { role, hasPermission } = useRole();
  const canRead = hasPermission('price_tier:read');

  const matrix = useApi(() => pricingApi.matrix(), [role]);
  const tiers = useApi(() => pricingApi.listTiers(), [role]);

  if (!canRead) {
    return (
      <>
        <PageHeader title="ระดับราคา" />
        <Card>
          <EmptyState
            title="ไม่มีสิทธิ์เข้าถึง"
            description="เฉพาะเจ้าของ ผู้จัดการ และพนักงานขายเท่านั้นที่เห็นระดับราคา"
            icon={<Tags className="size-5" aria-hidden />}
          />
        </Card>
      </>
    );
  }

  if (matrix.error || tiers.error) {
    const error = matrix.error ?? tiers.error;
    return (
      <>
        <PageHeader title="ระดับราคา" />
        <Card>{error ? <ErrorState error={error} onRetry={matrix.reload} /> : null}</Card>
      </>
    );
  }

  if (matrix.loading || tiers.loading || !matrix.data || !tiers.data) {
    return (
      <>
        <PageHeader title="ระดับราคา" description="ตั้งราคาตามระดับลูกค้าได้หลายสินค้าในหน้าเดียว" />
        <TableSkeleton rows={8} cols={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="ระดับราคา" description="ตั้งราคาตามระดับลูกค้าได้หลายสินค้าในหน้าเดียว" />
      <PriceMatrix
        rows={matrix.data}
        tiers={tiers.data}
        onSaved={() => {
          matrix.reload();
        }}
      />
    </>
  );
}
