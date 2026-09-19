'use client';

/**
 * /inventory/receive - goods receipt screen.
 *
 * Guarded by stock:adjust, mirroring the orders/new guard. The form itself
 * additionally requires cost:write, because a receipt opens a FIFO lot at a
 * purchase cost.
 */

import { ReceiveForm } from '@/components/inventory/receive-form';
import { useRole } from '@/components/role-provider';
import { Card, EmptyState, PageHeader, buttonClass } from '@/components/ui';
import Link from 'next/link';

export default function ReceivePage() {
  const { hasPermission } = useRole();

  // Guard first: only roles with stock:adjust may receive goods.
  if (!hasPermission('stock:adjust')) {
    return (
      <>
        <PageHeader title="รับสินค้าเข้า" description="บันทึกการรับสินค้าเข้าคลังกลาง" />
        <Card>
          <EmptyState
            title="ตำแหน่งงานของคุณไม่สามารถรับสินค้าเข้าได้"
            description="การรับสินค้าเข้าคลังต้องมีสิทธิ์ stock:adjust ลองสลับตำแหน่งงานที่มุมขวาบน หรือติดต่อผู้ดูแลระบบ"
            action={
              <Link href="/inventory" className={buttonClass('outline', 'sm')}>
                กลับไปหน้าสต็อกสินค้า
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="รับสินค้าเข้า"
        description="รับสินค้าเข้าคลังกลาง ระบบเปิดล็อตต้นทุน FIFO ให้อัตโนมัติ"
        eyebrow={
          <Link href="/inventory" className="hover:text-slate-700">
            สต็อกสินค้า
          </Link>
        }
      />
      <div data-tour-id="receive-submit">
        <ReceiveForm />
      </div>
    </>
  );
}
