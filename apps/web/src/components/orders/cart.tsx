'use client';

/**
 * Cart state for the manual bill screen (/orders/new).
 *
 * Money rule: the number input works in baht because that is what a cashier
 * types, but the value kept in state stays a string and is converted with
 * fromBaht() from @stockhub/core at the edge. Nothing downstream ever sees a
 * float amount of money.
 */

import { Button, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui';
import { cn } from '@/lib/cn';
import { baht, qty } from '@/lib/format';
import { fromBaht } from '@stockhub/core';
import { Trash2 } from 'lucide-react';

export interface CartLine {
  variantId: string;
  sku: string;
  name: string;
  unit: string;
  /** Available units at the time the row was added, used for the over-sell warning. */
  available: number;
  quantity: number;
  /** Raw text of the baht input. Empty string while the user clears the field. */
  priceBaht: string;
  discountBaht: string;
}

/** Editable fields of a cart row. */
export type CartLinePatch = Partial<Pick<CartLine, 'quantity' | 'priceBaht' | 'discountBaht'>>;

const toSatang = (text: string): number => {
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return fromBaht(value);
};

export const unitPriceOf = (line: CartLine): number => toSatang(line.priceBaht);

export const discountOf = (line: CartLine): number => toSatang(line.discountBaht);

/** quantity * unitPrice - discount, never below zero. */
export const lineTotalOf = (line: CartLine): number =>
  Math.max(unitPriceOf(line) * line.quantity - discountOf(line), 0);

export const cartTotalOf = (lines: CartLine[]): number =>
  lines.reduce((sum, line) => sum + lineTotalOf(line), 0);

/** Shared look for the in-cell number inputs. */
const NUMBER_INPUT = cn(
  'h-8 rounded-lg border px-2 text-right text-sm tabular-nums',
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
);

const NEUTRAL_INPUT = 'border-slate-300 bg-white text-slate-900';

interface CartTableProps {
  lines: CartLine[];
  onPatch: (variantId: string, patch: CartLinePatch) => void;
  onRemove: (variantId: string) => void;
}

export function CartTable({ lines, onPatch, onRemove }: CartTableProps) {
  return (
    <TableWrap>
      <Table>
        <Thead>
          <Tr>
            <Th>สินค้า</Th>
            <Th numeric>จำนวน</Th>
            <Th numeric>ราคา/หน่วย (บาท)</Th>
            <Th numeric>ส่วนลด (บาท)</Th>
            <Th numeric>ยอดรวมรายการ</Th>
            <Th className="w-10" />
          </Tr>
        </Thead>
        <Tbody>
          {lines.map((line) => {
            const overSold = line.quantity > line.available;
            return (
              <Tr key={line.variantId}>
                <Td>
                  <p className="font-medium text-slate-900">{line.name}</p>
                  <p className="font-mono text-xs text-slate-500">{line.sku}</p>
                  {overSold ? (
                    <p className="mt-1 text-xs text-amber-600">
                      จำนวนเกินสต็อกคงเหลือ ({qty(line.available)} {line.unit})
                    </p>
                  ) : null}
                </Td>
                <Td numeric>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={line.quantity}
                    aria-label={`จำนวนของ ${line.sku}`}
                    onChange={(event) =>
                      onPatch(line.variantId, {
                        quantity: Math.max(1, Math.trunc(Number(event.target.value) || 1)),
                      })
                    }
                    className={cn(
                      NUMBER_INPUT,
                      'w-20',
                      overSold ? 'border-amber-400 bg-amber-50 text-amber-800' : NEUTRAL_INPUT,
                    )}
                  />
                </Td>
                <Td numeric>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.priceBaht}
                    aria-label={`ราคาต่อหน่วยของ ${line.sku}`}
                    onChange={(event) => onPatch(line.variantId, { priceBaht: event.target.value })}
                    className={cn(NUMBER_INPUT, 'w-24', NEUTRAL_INPUT)}
                  />
                </Td>
                <Td numeric>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.discountBaht}
                    aria-label={`ส่วนลดของ ${line.sku}`}
                    onChange={(event) =>
                      onPatch(line.variantId, { discountBaht: event.target.value })
                    }
                    className={cn(NUMBER_INPUT, 'w-24', NEUTRAL_INPUT)}
                  />
                </Td>
                <Td numeric className="font-medium text-slate-900">
                  {baht(lineTotalOf(line))}
                </Td>
                <Td>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`นำ ${line.sku} ออกจากบิล`}
                    title="นำออกจากบิล"
                    onClick={() => onRemove(line.variantId)}
                  >
                    <Trash2 className="size-4 text-slate-400" aria-hidden />
                  </Button>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
