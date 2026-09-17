'use client';

/**
 * FIFO layers of one variant, oldest first - the order the costing engine will
 * consume them in. Shared by the quick view drawer and the detail page.
 */

import { CostValue } from '@/components/cost-value';
import { EmptyState, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui';
import type { StockLotRow } from '@/lib/api-types';
import { formatDate, qty } from '@/lib/format';

/** Remaining value of the open layers. Undefined when the role cannot see cost. */
export const lotsStockValue = (lots?: StockLotRow[]): number | undefined =>
  lots ? lots.reduce((sum, lot) => sum + lot.remainingQty * lot.unitCost, 0) : undefined;

const byReceivedAt = (a: StockLotRow, b: StockLotRow): number =>
  a.receivedAt.localeCompare(b.receivedAt);

export function VariantLotsTable({ lots }: { lots: StockLotRow[] }) {
  if (lots.length === 0) {
    return (
      <EmptyState title="ยังไม่มีล็อตคงเหลือ" description="สินค้านี้ยังไม่มีการรับเข้า หรือถูกตัดออกจนหมดทุกล็อตแล้ว" />
    );
  }

  return (
    <TableWrap>
      <Table>
        <Thead>
          <tr>
            <Th>รับเข้าเมื่อ</Th>
            <Th>อ้างอิง</Th>
            <Th numeric>จำนวนรับเข้า</Th>
            <Th numeric>คงเหลือ</Th>
            <Th numeric>ต้นทุน/หน่วย</Th>
            <Th numeric>มูลค่าคงเหลือ</Th>
          </tr>
        </Thead>
        <Tbody>
          {[...lots].sort(byReceivedAt).map((lot) => (
            <Tr key={lot.id}>
              <Td className="whitespace-nowrap">{formatDate(lot.receivedAt)}</Td>
              <Td className="text-slate-500">{lot.reference ?? '-'}</Td>
              <Td numeric className="text-slate-500">
                {qty(lot.receivedQty)}
              </Td>
              <Td numeric className="font-medium text-slate-900">
                {qty(lot.remainingQty)}
              </Td>
              <Td numeric>
                <CostValue value={lot.unitCost} />
              </Td>
              <Td numeric>
                <CostValue value={lot.remainingQty * lot.unitCost} />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
