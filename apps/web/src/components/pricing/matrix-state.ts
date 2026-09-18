/**
 * Pure state helpers for the price matrix screen.
 *
 * The screen edits TEXT (what the user types), the API wants SATANG or null,
 * and only the changed cells may be sent. Keeping that translation here -
 * outside React - makes it testable with bun test alone.
 *
 * Baht text conventions:
 *   ''            -> no cell (the variant falls back to the standard price)
 *   '12.345'      -> fromBaht rounds to the nearest satang (1_235)
 *   anything else -> reported by validateDraft, never silently sent
 */

import type { PriceMatrixRow, PriceTierView, TierPriceCell } from '@/lib/api-types-pricing';
import { type Satang, fromBaht, satang, toBaht } from '@stockhub/core';

/** draft[tierId][variantId] = the cell content as the user typed it, in baht. */
export type MatrixDraft = Record<string, Record<string, string>>;

export interface DraftIssue {
  tierId: string;
  variantId: string;
  message: string;
}

/** Seed the draft from the loaded matrix: a priced cell -> baht text, else ''. */
export const initDraft = (rows: PriceMatrixRow[], tiers: PriceTierView[]): MatrixDraft => {
  const draft: MatrixDraft = {};
  for (const tier of tiers) {
    if (tier.isDefault) continue;
    const cells: Record<string, string> = {};
    for (const row of rows) {
      const price = row.tierPrices[tier.id];
      cells[row.variantId] = price === undefined ? '' : String(toBaht(satang(price)));
    }
    draft[tier.id] = cells;
  }
  return draft;
};

export const setCell = (
  draft: MatrixDraft,
  tierId: string,
  variantId: string,
  text: string,
): MatrixDraft => ({
  ...draft,
  [tierId]: { ...draft[tierId], [variantId]: text },
});

/** The baht text is sendable when it is empty or a plain non-negative number. */
const parseBaht = (text: string): number | null => {
  if (text.trim().length === 0) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

/**
 * Changed cells of ONE tier: '' -> null (delete the cell), text -> satang.
 * Unchanged text produces nothing, so the PUT body stays minimal.
 */
export const diffDraft = (
  original: MatrixDraft,
  draft: MatrixDraft,
  tierId: string,
): TierPriceCell[] => {
  const before = original[tierId] ?? {};
  const after = draft[tierId] ?? {};
  const cells: TierPriceCell[] = [];
  for (const [variantId, text] of Object.entries(after)) {
    if ((before[variantId] ?? '') === text) continue;
    const baht = parseBaht(text);
    cells.push({ variantId, price: baht === null ? null : fromBaht(baht) });
  }
  return cells;
};

/** Every cell whose text cannot become a price, across all tiers. */
export const validateDraft = (draft: MatrixDraft): DraftIssue[] => {
  const issues: DraftIssue[] = [];
  for (const [tierId, cells] of Object.entries(draft)) {
    for (const [variantId, text] of Object.entries(cells)) {
      if (text.trim().length === 0) continue;
      if (parseBaht(text) === null) {
        issues.push({ tierId, variantId, message: `ราคา "${text}" ไม่ใช่ตัวเลขที่ถูกต้อง` });
      }
    }
  }
  return issues;
};

/** How many cells changed in total, across every tier - drives the save bar. */
export const dirtyCount = (original: MatrixDraft, draft: MatrixDraft): number => {
  let count = 0;
  for (const tierId of Object.keys(draft)) {
    count += diffDraft(original, draft, tierId).length;
  }
  return count;
};
