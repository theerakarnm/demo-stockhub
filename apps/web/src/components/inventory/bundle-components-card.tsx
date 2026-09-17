'use client';

/**
 * Bundle (สินค้าชุด) breakdown. A bundle holds no stock of its own: what it can
 * sell is limited by the scarcest component.
 */

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Table,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import type { BundleComponentRow } from '@/lib/api-types';
import { qty } from '@/lib/format';
import { Boxes } from 'lucide-react';
import Link from 'next/link';

/**
 * Display-only preview of the assemblable count.
 *
 * TODO(template): the authoritative number comes from bundleAvailability() in
 * @stockhub/core once it is implemented (it also accounts for reservations and
 * nested bundles). Replace this local min() with that call, do not extend it.
 */
const assemblableBundles = (components: BundleComponentRow[]): number => {
  if (components.length === 0) return 0;
  return Math.min(
    ...components.map((component) =>
      component.qtyPerBundle > 0
        ? Math.floor(component.componentOnHand / component.qtyPerBundle)
        : 0,
    ),
  );
};

export interface BundleComponentsCardProps {
  components: BundleComponentRow[];
  /** Selling unit of the bundle itself, e.g. "ชุด". */
  unit: string;
}

export function BundleComponentsCard({ components, unit }: BundleComponentsCardProps) {
  const assemblable = assemblableBundles(components);

  return (
    <Card>
      <CardHeader
        title="ส่วนประกอบของสินค้าชุด"
        description="สินค้าชุดไม่ได้เก็บสต็อกของตัวเอง จำนวนที่ขายได้ขึ้นกับชิ้นส่วนที่เหลือน้อยที่สุด"
        action={
          <Badge tone="purple">
            <Boxes className="size-3" aria-hidden />
            ประกอบได้ {qty(assemblable)} {unit}
          </Badge>
        }
      />
      {components.length === 0 ? (
        <EmptyState
          title="ยังไม่ได้กำหนดส่วนประกอบ"
          description="เพิ่มรายการชิ้นส่วนของชุดนี้ก่อน ระบบจึงจะคำนวณจำนวนที่ประกอบได้"
        />
      ) : (
        <TableWrap>
          <Table>
            <Thead>
              <tr>
                <Th>SKU</Th>
                <Th>ชื่อชิ้นส่วน</Th>
                <Th numeric>ใช้ต่อชุด</Th>
                <Th numeric>คงเหลือของชิ้นส่วน</Th>
                <Th numeric>ประกอบได้จากชิ้นส่วนนี้</Th>
              </tr>
            </Thead>
            <Tbody>
              {components.map((component) => {
                const fromThis =
                  component.qtyPerBundle > 0
                    ? Math.floor(component.componentOnHand / component.qtyPerBundle)
                    : 0;
                const isBottleneck = fromThis === assemblable;
                return (
                  <Tr key={component.componentVariantId} highlight={isBottleneck}>
                    <Td className="font-mono text-xs text-slate-500">
                      <Link
                        href={`/inventory/${component.componentVariantId}`}
                        className="hover:text-emerald-600 hover:underline"
                      >
                        {component.sku}
                      </Link>
                    </Td>
                    <Td className="font-medium text-slate-900">{component.name}</Td>
                    <Td numeric>{qty(component.qtyPerBundle)}</Td>
                    <Td numeric>{qty(component.componentOnHand)}</Td>
                    <Td numeric>
                      <span className="inline-flex items-center gap-1.5">
                        {qty(fromThis)}
                        {isBottleneck ? <Badge tone="warning">ตัวจำกัด</Badge> : null}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableWrap>
      )}
      <CardBody className="border-t border-slate-200 py-2 text-xs text-slate-500">
        ประกอบได้สูงสุด {qty(assemblable)} {unit} จากชิ้นส่วนที่เหลืออยู่ตอนนี้
      </CardBody>
    </Card>
  );
}
