'use client';

/**
 * The price matrix: one row per variant, one editable column per non-default
 * tier. This is the brief's "การตั้งราคาหลายสินค้าควรสะดวกพอสำหรับร้านที่มี
 * สินค้าเยอะ" answer: search narrows the rows, one save commits every edit of
 * every tier (one PUT per dirty tier, in parallel), and a cell the shop never
 * fills simply stays empty so the variant keeps falling back to the standard
 * selling price.
 */

import { useRole } from '@/components/role-provider';
import { Button, Card, CardBody, SearchInput } from '@/components/ui';
import { pricingApi } from '@/lib/api-pricing';
import type { PriceMatrixRow, PriceTierView } from '@/lib/api-types-pricing';
import { baht } from '@/lib/format';
import { useMutation } from '@/lib/use-api';
import { useEffect, useMemo, useState } from 'react';
import {
  type MatrixDraft,
  diffDraft,
  dirtyCount,
  initDraft,
  setCell,
  validateDraft,
} from './matrix-state';

export interface PriceMatrixProps {
  rows: PriceMatrixRow[];
  tiers: PriceTierView[];
  /** Called after a successful save so the parent can reload the matrix. */
  onSaved: () => void;
}

interface SavePayload {
  original: MatrixDraft;
  draft: MatrixDraft;
}

export function PriceMatrix({ rows, tiers, onSaved }: PriceMatrixProps) {
  const { hasPermission } = useRole();
  const canWrite = hasPermission('price_tier:write');

  const editTiers = useMemo(() => tiers.filter((tier) => !tier.isDefault), [tiers]);
  const defaultTier = useMemo(() => tiers.find((tier) => tier.isDefault), [tiers]);

  const [original, setOriginal] = useState<MatrixDraft>(() => initDraft(rows, tiers));
  const [draft, setDraft] = useState<MatrixDraft>(original);
  const [search, setSearch] = useState('');

  // A reload replaces the rows array; reseed both drafts from the new data.
  useEffect(() => {
    const next = initDraft(rows, tiers);
    setOriginal(next);
    setDraft(next);
  }, [rows, tiers]);

  // One PUT per dirty tier, in parallel; resolve(true) only when all answered.
  const save = useMutation(async (payload: SavePayload) => {
    await Promise.all(
      Object.keys(payload.draft).map((tierId) => {
        const cells = diffDraft(payload.original, payload.draft, tierId);
        return cells.length === 0 ? Promise.resolve() : pricingApi.putTierPrices(tierId, cells);
      }),
    );
    return true;
  });

  const issues = validateDraft(draft);
  const dirty = dirtyCount(original, draft);
  const needle = search.trim().toLowerCase();
  const visibleRows = needle
    ? rows.filter(
        (row) => row.sku.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
      )
    : rows;

  const saveAll = () => {
    void save.run({ original, draft }).then((done) => {
      if (done) onSaved();
    });
  };

  const firstIssue = issues[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาสินค้าในตาราง"
            aria-label="ค้นหาสินค้า"
          />
        </div>
        <p className="text-xs text-slate-500">
          เว้นว่าง = ใช้ราคาขายมาตรฐาน{defaultTier ? ` (${defaultTier.name})` : ''}
        </p>
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">SKU</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">สินค้า</th>
                  {defaultTier ? (
                    <th className="px-3 py-2 text-right font-medium text-slate-600">
                      {defaultTier.name}
                      <span className="block text-[11px] font-normal text-slate-400">
                        ใช้ราคาขายมาตรฐาน
                      </span>
                    </th>
                  ) : null}
                  {editTiers.map((tier) => (
                    <th key={tier.id} className="px-3 py-2 text-right font-medium text-slate-600">
                      {tier.name}
                      <span className="block text-[11px] font-normal text-slate-400">บาท</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.variantId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.sku}</td>
                    <td className="px-3 py-2 text-slate-900">{row.name}</td>
                    {defaultTier ? (
                      <td className="px-3 py-2 text-right text-slate-500">
                        {baht(row.sellingPrice)}
                      </td>
                    ) : null}
                    {editTiers.map((tier) => {
                      const text = draft[tier.id]?.[row.variantId] ?? '';
                      const invalid = issues.some(
                        (issue) => issue.tierId === tier.id && issue.variantId === row.variantId,
                      );
                      return (
                        <td key={tier.id} className="px-3 py-1.5 text-right">
                          <input
                            inputMode="decimal"
                            aria-label={`${tier.name} ${row.sku}`}
                            aria-invalid={invalid}
                            className={
                              invalid
                                ? 'w-24 rounded-md border border-red-400 px-2 py-1 text-right text-sm'
                                : 'w-24 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:border-emerald-500 focus:outline-none'
                            }
                            value={text}
                            disabled={!canWrite || save.pending}
                            onChange={(event) =>
                              setDraft(setCell(draft, tier.id, row.variantId, event.target.value))
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {canWrite ? (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <p className="text-xs text-slate-500" role={issues.length > 0 ? 'alert' : undefined}>
            {firstIssue ? firstIssue.message : dirty > 0 ? `มี ${dirty} รายการที่แก้` : 'ยังไม่มีการแก้ไข'}
          </p>
          <Button disabled={dirty === 0 || issues.length > 0 || save.pending} onClick={saveAll}>
            {save.pending ? 'กำลังบันทึก...' : `บันทึก ${dirty} รายการที่แก้`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
