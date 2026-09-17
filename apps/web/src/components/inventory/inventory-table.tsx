'use client';

/**
 * Stock table of /inventory. One central pool, so the row shows the numbers
 * every channel shares: on hand, reserved and available.
 */

import { CostValue } from '@/components/cost-value';
import { Badge, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui';
import type { StockRow } from '@/lib/api-types';
import { baht, qty } from '@/lib/format';
import { VARIANT_KIND_LABELS } from '@/lib/labels';

/** Reorder point reached. Same rule as lowStockCount on the dashboard. */
export const isLowStock = (row: StockRow): boolean => row.onHand <= row.lowStockThreshold;

export interface InventoryTableProps {
  rows: StockRow[];
  selectedVariantId: string | null;
  onSelect: (variantId: string) => void;
}

export function InventoryTable({ rows, selectedVariantId, onSelect }: InventoryTableProps) {
  return (
    <TableWrap>
      <Table>
        <Thead>
          <tr>
            <Th>SKU</Th>
            <Th>ชื่อสินค้า</Th>
            <Th>หน่วย</Th>
            <Th numeric>คงเหลือ</Th>
            <Th numeric>จอง</Th>
            <Th numeric>พร้อมขาย</Th>
            <Th numeric>ราคาขาย</Th>
            <Th numeric>ต้นทุนเฉลี่ย/หน่วย</Th>
            <Th numeric>มูลค่าสต็อก</Th>
          </tr>
        </Thead>
        <Tbody>
          {rows.map((row) => {
            const low = isLowStock(row);
            return (
              <Tr
                key={row.variantId}
                clickable
                highlight={low}
                onClick={() => onSelect(row.variantId)}
                // Keyboard parity: the row is the only way into the quick view.
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onSelect(row.variantId);
                }}
                aria-selected={selectedVariantId === row.variantId}
                className={
                  selectedVariantId === row.variantId ? 'ring-1 ring-emerald-300' : undefined
                }
              >
                <Td className="font-mono text-xs text-slate-500">{row.sku}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    {row.kind === 'bundle' ? (
                      <Badge tone="purple">{VARIANT_KIND_LABELS.bundle}</Badge>
                    ) : null}
                  </span>
                </Td>
                <Td className="text-slate-500">{row.unit}</Td>
                <Td numeric>
                  <span className="inline-flex items-center justify-end gap-1.5">
                    {qty(row.onHand)}
                    {low ? (
                      // Tooltip sits on the wrapper: <Badge> takes no title prop.
                      <span title={`จุดเตือนสต็อกต่ำ ${qty(row.lowStockThreshold)} ${row.unit}`}>
                        <Badge tone="warning">ใกล้หมด</Badge>
                      </span>
                    ) : null}
                  </span>
                </Td>
                <Td numeric className="text-slate-500">
                  {qty(row.reserved)}
                </Td>
                <Td numeric className="font-medium text-slate-900">
                  {qty(row.available)}
                </Td>
                <Td numeric>{baht(row.sellingPrice)}</Td>
                <Td numeric>
                  <CostValue value={row.avgUnitCost} />
                </Td>
                <Td numeric>
                  <CostValue value={row.stockValue} />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
