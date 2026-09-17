'use client';

/**
 * The blocker section. An import cannot be applied while a platform SKU has no
 * internal variant, so this panel is rendered first and coloured rose.
 */

import { Button, Select, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import type { UnmatchedSku } from '@/lib/api-types';
import { percent, qty } from '@/lib/format';
import { AlertTriangle, Link2 } from 'lucide-react';
import { useState } from 'react';

export interface UnmatchedPanelProps {
  items: UnmatchedSku[];
  /** Platform SKU currently being saved, so only its row shows the spinner. */
  pendingSku: string | null;
  onMatch: (platformSku: string, variantId: string) => void;
}

const suggestionOptions = (item: UnmatchedSku): SelectOption[] =>
  item.suggestions.map((suggestion) => ({
    value: suggestion.variantId,
    label:
      suggestion.score === undefined
        ? `${suggestion.sku} - ${suggestion.name}`
        : `${suggestion.sku} - ${suggestion.name} (คะแนน ${percent(suggestion.score, 0)})`,
  }));

export function UnmatchedPanel({ items, pendingSku, onMatch }: UnmatchedPanelProps) {
  // Only the rows the user touched live here; everything else falls back to the
  // best suggestion the API returned.
  const [picked, setPicked] = useState<Record<string, string>>({});

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50/60 shadow-sm">
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
              const options = suggestionOptions(item);
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
                    {options.length === 0 ? (
                      <span
                        className="text-xs text-slate-500"
                        title="ยังไม่มีสินค้าใกล้เคียงในระบบ ให้สร้างสินค้าก่อนแล้วอัปโหลดไฟล์ใหม่"
                      >
                        ไม่มีสินค้าใกล้เคียงในระบบ
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {/* TODO(template): add a full product search here for the
                            case where none of the suggestions is right. */}
                        <Select
                          aria-label={`เลือกสินค้าที่ตรงกับ ${item.platformSku}`}
                          options={options}
                          value={value}
                          disabled={saving}
                          onChange={(event) =>
                            setPicked((current) => ({
                              ...current,
                              [item.platformSku]: event.target.value,
                            }))
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
                    )}
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
