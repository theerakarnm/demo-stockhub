'use client';

/**
 * Product picker for the manual bill screen.
 *
 * Search hits GET /api/v1/inventory directly - the screen never filters a
 * cached list, because stock changes while the cashier is typing.
 */

import { useRole } from '@/components/role-provider';
import {
  Button,
  EmptyState,
  ErrorState,
  SearchInput,
  Table,
  TableSkeleton,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import type { StockRow } from '@/lib/api-types';
import { baht, qty } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { Plus } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

interface ProductPickerProps {
  /** Variant ids already in the cart, so the row shows "เพิ่มแล้ว" instead. */
  selectedIds: string[];
  onAdd: (row: StockRow) => void;
}

export function ProductPicker({ selectedIds, onAdd }: ProductPickerProps) {
  const { role } = useRole();
  const [q, setQ] = useState('');
  // Deferred value keeps one request per pause in typing without a debounce hook.
  const deferredQ = useDeferredValue(q);
  const { data, error, loading, reload } = useApi(
    () => api.getInventory({ q: deferredQ, limit: 8 }),
    [deferredQ, role],
  );

  const rows = data?.items ?? [];

  return (
    <div>
      <SearchInput
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="ค้นหาด้วยชื่อสินค้าหรือ SKU"
        aria-label="ค้นหาสินค้า"
      />

      <div className="mt-3 rounded-lg border border-slate-200">
        {loading && !data ? <TableSkeleton rows={4} cols={4} /> : null}
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {!error && !loading && rows.length === 0 ? (
          <EmptyState title="ไม่พบสินค้าที่ค้นหา" description="ลองค้นด้วยคำอื่น หรือตรวจสอบรหัส SKU อีกครั้ง" />
        ) : null}
        {!error && rows.length > 0 ? (
          <TableWrap>
            <Table>
              <Thead>
                <Tr>
                  <Th>สินค้า</Th>
                  <Th numeric>คงเหลือ</Th>
                  <Th numeric>ราคาขาย</Th>
                  <Th className="w-24" />
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row) => {
                  const added = selectedIds.includes(row.variantId);
                  return (
                    <Tr key={row.variantId}>
                      <Td>
                        <p className="font-medium text-slate-900">{row.name}</p>
                        <p className="font-mono text-xs text-slate-500">{row.sku}</p>
                      </Td>
                      <Td numeric>
                        <span className={row.available <= 0 ? 'text-rose-600' : undefined}>
                          {qty(row.available)}
                        </span>
                        <span className="ml-1 text-xs text-slate-400">{row.unit}</span>
                      </Td>
                      <Td numeric>{baht(row.sellingPrice)}</Td>
                      <Td>
                        <Button
                          variant={added ? 'ghost' : 'outline'}
                          size="sm"
                          disabled={added}
                          title={added ? 'สินค้านี้อยู่ในบิลแล้ว' : 'เพิ่มลงบิล'}
                          onClick={() => onAdd(row)}
                        >
                          <Plus className="size-3.5" aria-hidden />
                          {added ? 'เพิ่มแล้ว' : 'เพิ่ม'}
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableWrap>
        ) : null}
      </div>
    </div>
  );
}
