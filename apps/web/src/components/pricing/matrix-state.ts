/**
 * Pure state for the price matrix screen.
 *
 * The draft holds what the user typed - baht text, not numbers - so the input
 * can stay "12." mid-edit without fighting the cursor. Converting, diffing and
 * validating happen at save time; nothing here touches the network.
 */

import type { PriceMatrixRow, PriceTierView, TierPriceCell } from '@/lib/api-types-pricing';
import { fromBaht } from '@stockhub/core';

/** tierId -> variantId -> the raw baht text in that cell. */
export type MatrixDraft = Record<string, Record<string, string>>;

const bahtText = (satang: number): string => (satang / 100).toFixed(2);

/** One entry per tier per variant; a missing tier price is an empty cell. */
export const initDraft = (rows: PriceMatrixRow[], tiers: PriceTierView[]): MatrixDraft => {
  const draft: MatrixDraft = {};
  for (const tier of tiers) {
    const column: Record<string, string> = {};
    for (const row of rows) {
      const price = row.tierPrices[tier.id];
      column[row.variantId] = price === undefined ? '' : bahtText(price);
    }
    draft[tier.id] = column;
  }
  return draft;
};

/** One keystroke: returns a new draft, the old one keeps rendering. */
export const setCell = (
  draft: MatrixDraft,
  tierId: string,
  variantId: string,
  text: string,
): MatrixDraft => ({
  ...draft,
  [tierId]: { ...draft[tierId], [variantId]: text },
});

/** '' clears the price, anything else parses through fromBaht (it rounds). */
const parseCell = (text: string): number | null | 'invalid' => {
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return 'invalid';
  return fromBaht(value);
};

/** Cells of ONE tier column that differ from `original`; invalid text is skipped. */
export const diffDraft = (
  original: PriceMatrixRow[],
  draft: MatrixDraft,
  tierId: string,
): TierPriceCell[] => {
  const column = draft[tierId] ?? {};
  const cells: TierPriceCell[] = [];
  for (const row of original) {
    const parsed = parseCell(column[row.variantId] ?? '');
    if (parsed === 'invalid') continue;
    const current = row.tierPrices[tierId];
    if (parsed === null) {
      if (current !== undefined) cells.push({ variantId: row.variantId, price: null });
    } else if (parsed !== current) {
      cells.push({ variantId: row.variantId, price: parsed });
    }
  }
  return cells;
};

export interface DraftIssue {
  tierId: string;
  variantId: string;
  message: string;
}

/** Every cell whose text would not save, so the user sees what blocks the save. */
export const validateDraft = (draft: MatrixDraft): DraftIssue[] => {
  const issues: DraftIssue[] = [];
  for (const [tierId, column] of Object.entries(draft)) {
    for (const [variantId, text] of Object.entries(column)) {
      if (text === '') continue;
      const value = Number(text);
      if (!Number.isFinite(value) || value < 0) {
        issues.push({ tierId, variantId, message: 'ราคาต้องเป็นตัวเลขที่ไม่ติดลบ' });
      }
    }
  }
  return issues;
};

/** How many cells differ across every tier column - the save bar's counter. */
export const dirtyCount = (original: PriceMatrixRow[], draft: MatrixDraft): number => {
  let count = 0;
  for (const tierId of Object.keys(draft)) count += diffDraft(original, draft, tierId).length;
  return count;
};
