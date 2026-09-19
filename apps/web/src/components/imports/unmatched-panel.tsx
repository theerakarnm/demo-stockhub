'use client';

/**
 * The blocker section. An import cannot be applied while a platform SKU has no
 * internal variant, so this panel is rendered first and coloured rose.
 */

import { VariantPicker } from '@/components/catalog/variant-picker';
import { Button, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui';
import type { UnmatchedSku } from '@/lib/api-types';
import { qty } from '@/lib/format';
import { AlertTriangle, Link2 } from 'lucide-react';
import { useState } from 'react';

export interface UnmatchedPanelProps {
  items: UnmatchedSku[];
  /** Platform SKU currently being saved, so only its row shows the spinner. */
  pendingSku: string | null;
  onMatch: (platformSku: string, variantId: string) => void;
}

export function UnmatchedPanel({ items, pendingSku, onMatch }: UnmatchedPanelProps) {
  // Only the rows the user touched live here; everything else falls back to the
  // best suggestion the API returned.
  const [picked, setPicked] = useState<Record<string, string>>({});

  return (
    <section
      data-tour-id="unmatched-panel"
      className="rounded-xl border border-rose-200 bg-rose-50/60 shadow-sm"
    >
      <div className="flex items-start gap-3 border-b border-rose-200 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            SKU ที่จับคู่ไม่ได้ ({qty(items.length)} รายการ)
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            เลือกสินค้าในระบบให้ตรงกับรหัสที่พิมพ์มาในไฟล์ แล้วกด จับคู่ ระบบจะจำการจับคู่นี้ไว้ ไฟล์ครั้งต่อไปจะจับคู่ให้อัตโนมัติ
          </p>
        </div>
      </div>

      <TableWrap>
        <Table>
          <Thead>
            <Tr>
              <Th>SKU ในไฟล์</Th>
              <Th>ชื่อสินค้าบนแพลตฟอร์ม</Th>
              <Th numeric>พบในกี่รายการ</Th>
              <Th numeric>จำนวนรวม</Th>
              <Th className="w-[30rem]">จับคู่กับสินค้าในระบบ</Th>
            </Tr>
          </Thead>
          <Tbody className="bg-white">
            {items.map((item) => {
              const fallback = item.suggestions[0]?.variantId ?? '';
              const value = picked[item.platformSku] ?? fallback;
              const saving = pendingSku === item.platformSku;

              return (
                <Tr key={item.platformSku}>
                  <Td className="font-mono text-xs text-slate-900">{item.platformSku}</Td>
                  <Td className="max-w-xs truncate">{item.platformProductName}</Td>
                  <Td numeric>{qty(item.occurrences)}</Td>
                  <Td numeric>{qty(item.quantity)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <VariantPicker
                        ariaLabel={`เลือกสินค้าที่ตรงกับ ${item.platformSku}`}
                        value={value}
                        suggestions={item.suggestions}
                        disabled={saving}
                        onChange={(variantId) =>
                          setPicked((current) => ({ ...current, [item.platformSku]: variantId }))
                        }
                      />
                      <Button
                        size="sm"
                        loading={saving}
                        disabled={value === ''}
                        onClick={() => onMatch(item.platformSku, value)}
                      >
                        <Link2 className="size-3.5" aria-hidden />
                        จับคู่
                      </Button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </TableWrap>
    </section>
  );
}
