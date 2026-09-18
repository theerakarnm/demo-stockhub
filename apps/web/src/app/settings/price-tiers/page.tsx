'use client';

/**
 * /settings/price-tiers - the price matrix, one editable column per tier.
 *
 * Guarded by price_tier:read with the EmptyState pattern: a role without the
 * permission sees a locked card and the browser never fires the request.
 */

import { PriceMatrix } from '@/components/pricing/price-matrix';
import { useRole } from '@/components/role-provider';
import { Card, CardBody, CardSkeleton, EmptyState, ErrorState, PageHeader } from '@/components/ui';
import { pricingApi } from '@/lib/api-pricing';
import { useApi } from '@/lib/use-api';
import { Lock, Tags } from 'lucide-react';

export default function PriceTiersPage() {
  const { role, hasPermission } = useRole();
  const allowed = hasPermission('price_tier:read');

  // Same short-circuit as the cost report: no request leaves the browser.
  const matrix = useApi(
    () => (allowed ? pricingApi.matrix() : Promise.resolve(null)),
    [allowed, role],
  );
  const tiers = useApi(
    () => (allowed ? pricingApi.listTiers() : Promise.resolve(null)),
    [allowed, role],
  );

  if (!allowed) {
    return (
      <>
        <PageHeader title="ระดับราคา" />
        <Card className="mx-auto max-w-lg">
          <CardBody>
            <EmptyState
              icon={<Lock className="size-5" aria-hidden />}
              title="ตำแหน่งงานของคุณดูระดับราคาไม่ได้"
              description="หน้านี้แสดงราคาต่อระดับของทุกสินค้า จึงเปิดให้เฉพาะตำแหน่งที่มีสิทธิ์ price_tier:read เช่น เจ้าของกิจการหรือผู้จัดการ"
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const loading =
    (matrix.loading || tiers.loading) && (matrix.data === null || tiers.data === null);
  const error = matrix.error ?? tiers.error;
  const reload = () => {
    matrix.reload();
    tiers.reload();
  };

  return (
    <>
      <PageHeader
        title="ระดับราคา"
        description="ตั้งราคาต่อระดับลูกค้า ช่องว่างใช้ราคาขายมาตรฐานเมื่อเปิดบิล"
        actions={<Tags className="size-5 text-slate-400" aria-hidden />}
      />

      {loading ? <CardSkeleton /> : null}

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : null}

      {matrix.data && tiers.data && !error ? (
        <PriceMatrix rows={matrix.data} tiers={tiers.data} onSaved={reload} />
      ) : null}
    </>
  );
}
