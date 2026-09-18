'use client';

/**
 * The price matrix: one row per variant, one editable column per non-default
 * tier. The default tier column stays read-only because its price IS the
 * standard selling price - there is nothing to configure.
 *
 * Edits land in a local draft and are saved as ONE batched PUT per dirty tier
 * (Promise.all across tiers), so saving a whole column is a single request.
 */

import { useRole } from '@/components/role-provider';
import { Button, Table, TableWrap, Tbody, Td, Th, Thead, Tr, fieldClass } from '@/components/ui';
import { pricingApi } from '@/lib/api-pricing';
import type { PriceMatrixRow, PriceTierView } from '@/lib/api-types-pricing';
import { baht } from '@/lib/format';
import { useEffect, useState } from 'react';
import {
  type MatrixDraft,
  diffDraft,
  dirtyCount,
  initDraft,
  setCell,
  validateDraft,
} from './matrix-state';

interface PriceMatrixProps {
  rows: PriceMatrixRow[];
  tiers: PriceTierView[];
  /** Called after a successful save so the parent refetches the matrix. */
  onSaved: () => void;
}

export function PriceMatrix({ rows, tiers, onSaved }: PriceMatrixProps) {
  const { hasPermission } = useRole();
  const canWrite = hasPermission('price_tier:write');
  const [draft, setDraft] = useState<MatrixDraft>(() => initDraft(rows, tiers));
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-seed the draft whenever the parent hands us a fresh matrix (after save).
  useEffect(() => {
    setDraft(initDraft(rows, tiers));
  }, [rows, tiers]);

  const defaultTier = tiers.find((tier) => tier.isDefault);
  const editableTiers = tiers.filter((tier) => !tier.isDefault);

  const needle = q.trim().toLowerCase();
  const visibleRows = needle
    ? rows.filter(
        (row) => row.sku.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
      )
    : rows;

  const issues = validateDraft(draft);
  const dirtyTiers = editableTiers.filter((tier) => diffDraft(rows, draft, tier.id).length > 0);
  const dirtyCells = dirtyCount(rows, draft);

  const save = async () => {
    if (!canWrite || saving || issues.length > 0 || dirtyTiers.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await Promise.all(
        dirtyTiers.map((tier) =>
          pricingApi.putTierPrices(tier.id, diffDraft(rows, draft, tier.id)),
        ),
      );
      onSaved();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="max-w-md">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="ค้นหาสินค้าในตาราง"
          aria-label="ค้นหาสินค้าในตาราง"
          className={fieldClass()}
        />
      </div>

      <TableWrap className="max-h-[60vh] overflow-auto">
        <Table>
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <Th className="bg-slate-50">SKU</Th>
              <Th className="bg-slate-50">สินค้า</Th>
              <Th numeric className="bg-slate-50">
                ราคาขายมาตรฐาน
              </Th>
              {tiers.map((tier) =>
                tier.isDefault ? (
                  <Th key={tier.id} numeric className="bg-slate-50">
                    {tier.name}
                    <span className="ml-1 font-normal text-slate-400">(ใช้ราคาขายมาตรฐาน)</span>
                  </Th>
                ) : (
                  <Th key={tier.id} numeric className="bg-slate-50">
                    {tier.name}
                  </Th>
                ),
              )}
            </tr>
          </thead>
          <Tbody>
            {visibleRows.map((row) => (
              <Tr key={row.variantId}>
                <Td className="font-mono text-xs text-slate-500">{row.sku}</Td>
                <Td className="font-medium text-slate-900">{row.name}</Td>
                <Td numeric>{baht(row.sellingPrice)}</Td>
                {tiers.map((tier) =>
                  tier.isDefault ? (
                    <Td key={tier.id} numeric className="text-slate-400">
                      {baht(row.sellingPrice)}
                    </Td>
                  ) : (
                    <Td key={tier.id} numeric>
                      <input
                        value={draft[tier.id]?.[row.variantId] ?? ''}
                        onChange={(event) =>
                          setDraft(setCell(draft, tier.id, row.variantId, event.target.value))
                        }
                        disabled={!canWrite}
                        inputMode="decimal"
                        aria-label={`${tier.name} ${row.sku}`}
                        className={`${fieldClass('w-28 text-right')} h-8`}
                      />
                    </Td>
                  ),
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableWrap>

      {saveError ? <p className="text-xs text-rose-600">{saveError}</p> : null}
      {issues.length > 0 ? (
        <p className="text-xs text-rose-600">
          มี {issues.length} รายการที่รูปแบบราคาไม่ถูกต้อง กรุณาแก้ไขก่อนบันทึก
        </p>
      ) : null}

      {dirtyCells > 0 ? (
        <div className="sticky bottom-0 flex items-center justify-between gap-4 rounded-t-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
          <p className="text-sm text-slate-700">
            {issues.length > 0 ? 'แก้ไขราคาที่ไม่ถูกต้องก่อนบันทึก' : `มี ${dirtyCells} รายการที่แก้`}
          </p>
          <Button onClick={save} disabled={!canWrite || issues.length > 0 || saving}>
            {saving ? 'กำลังบันทึก...' : `บันทึก ${dirtyCells} รายการที่แก้`}
          </Button>
        </div>
      ) : null}

      {!canWrite ? (
        <p className="text-xs text-slate-500">ตำแหน่งงานของคุณดูราคาได้เท่านั้น แก้ไขไม่ได้</p>
      ) : null}
    </div>
  );
}
