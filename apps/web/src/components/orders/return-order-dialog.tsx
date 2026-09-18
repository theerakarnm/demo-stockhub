'use client';

/**
 * Per-line return dialog for a shipped bill.
 *
 * A return is quantity driven: the cashier states how many units of each line
 * came back and whether they go back into sellable stock. Damaged units must
 * NOT re-enter stock, so "นำกลับเข้าสต็อก" defaults to true but can be
 * switched off per line - the API restores the cost either way.
 */

import { Button, Dialog } from '@/components/ui';
import type { ApiError } from '@/lib/api-error';
import type { OrderLine, ReturnOrderLineInput } from '@/lib/api-types';
import { baht, qty } from '@/lib/format';
import { useEffect, useState } from 'react';

interface ReturnOrderDialogProps {
  open: boolean;
  onClose: () => void;
  lines: readonly OrderLine[];
  pending: boolean;
  error: ApiError | null;
  /** Called with the per-line quantities the user confirmed. */
  onConfirm: (lines: ReturnOrderLineInput[]) => void;
}

interface ReturnDraft {
  quantity: number;
  restock: boolean;
}

/** A line with 0 units returns nothing and is dropped from the request. */
const draftsToInput = (
  lines: readonly OrderLine[],
  drafts: ReadonlyMap<string, ReturnDraft>,
): ReturnOrderLineInput[] =>
  lines.flatMap((line) => {
    const draft = drafts.get(line.id);
    if (!draft || draft.quantity <= 0) return [];
    return [{ orderLineId: line.id, quantity: draft.quantity, restock: draft.restock }];
  });

export function ReturnOrderDialog({
  open,
  onClose,
  lines,
  pending,
  error,
  onConfirm,
}: ReturnOrderDialogProps) {
  // Fresh drafts every time the dialog opens: reopening after a partial
  // return must show the full original quantities, not stale ones.
  const [drafts, setDrafts] = useState<ReadonlyMap<string, ReturnDraft>>(new Map());

  useEffect(() => {
    if (!open) return;
    setDrafts(new Map(lines.map((line) => [line.id, { quantity: line.quantity, restock: true }])));
  }, [open, lines]);

  const patchDraft = (lineId: string, patch: Partial<ReturnDraft>): void => {
    setDrafts((current) => {
      const draft = current.get(lineId);
      if (!draft) return current;
      return new Map(current).set(lineId, { ...draft, ...patch });
    });
  };

  const totalUnits = [...drafts.values()].reduce((sum, draft) => sum + draft.quantity, 0);
  const hasAny = totalUnits > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="รับคืนสินค้า"
      description="ระบุจำนวนที่ลูกค้าคืนต่อรายการ และเลือกว่าจะนำกลับเข้าสต็อกขายได้หรือไม่"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            ปิด
          </Button>
          <Button
            disabled={!hasAny}
            loading={pending}
            onClick={() => onConfirm(draftsToInput(lines, drafts))}
          >
            ยืนยันรับคืน ({qty(totalUnits)} หน่วย)
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {lines.map((line) => {
          const draft = drafts.get(line.id);
          if (!draft) return null;
          return (
            <div key={line.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{line.name}</p>
                  <p className="font-mono text-xs text-slate-500">{line.sku}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={line.quantity}
                    step={1}
                    value={draft.quantity}
                    aria-label={`จำนวนรับคืนของ ${line.sku}`}
                    onChange={(event) =>
                      patchDraft(line.id, {
                        quantity: Math.min(
                          Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          line.quantity,
                        ),
                      })
                    }
                    className="h-8 w-20 rounded-lg border border-slate-300 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <span className="text-xs text-slate-400">/ {qty(line.quantity)}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={draft.restock}
                    onChange={(event) => patchDraft(line.id, { restock: event.target.checked })}
                    className="size-3.5 rounded border-slate-300 accent-emerald-600"
                  />
                  นำกลับเข้าสต็อกขายได้ (ปลดเครื่องหมายถ้าสินค้าชำรุด)
                </label>
                <span className="text-xs tabular-nums text-slate-500">
                  ราคาขาย {baht(line.unitPrice)} / หน่วย
                </span>
              </div>
            </div>
          );
        })}
        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error.message}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
