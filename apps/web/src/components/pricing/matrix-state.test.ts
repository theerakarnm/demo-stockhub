/**
 * Pure tests for the matrix draft state: typing, diffing against the original
 * matrix and validation. No network, no React.
 */

import { describe, expect, test } from 'bun:test';
import type { PriceMatrixRow, PriceTierView } from '@/lib/api-types-pricing';
import { diffDraft, dirtyCount, initDraft, setCell, validateDraft } from './matrix-state';

const tiers: PriceTierView[] = [
  { id: 'tier_retail', code: 'retail', name: 'ราคาปลีก', sortOrder: 1, isDefault: true },
  { id: 'tier_ws', code: 'wholesale', name: 'ราคาส่ง', sortOrder: 2, isDefault: false },
];

const rows: PriceMatrixRow[] = [
  {
    variantId: 'var_hoe',
    sku: 'HOE-001',
    name: 'จอบถางหญ้า',
    sellingPrice: 18500,
    tierPrices: { tier_ws: 16700 },
  },
  {
    variantId: 'var_wc',
    sku: 'WCN-10L',
    name: 'ถังน้ำ 10 ลิตร',
    sellingPrice: 14500,
    tierPrices: {},
  },
];

const clean = initDraft(rows, tiers);

describe('matrix draft state', () => {
  test('one edit yields exactly one cell', () => {
    const draft = setCell(clean, 'tier_ws', 'var_hoe', '160.00');
    expect(diffDraft(rows, draft, 'tier_ws')).toEqual([{ variantId: 'var_hoe', price: 16000 }]);
    expect(dirtyCount(rows, draft)).toBe(1);
  });

  test('clearing a priced cell yields a null delete', () => {
    const draft = setCell(clean, 'tier_ws', 'var_hoe', '');
    expect(diffDraft(rows, draft, 'tier_ws')).toEqual([{ variantId: 'var_hoe', price: null }]);
  });

  test('unchanged text yields nothing', () => {
    expect(diffDraft(rows, clean, 'tier_ws')).toEqual([]);
    expect(dirtyCount(rows, clean)).toBe(0);
  });

  test('fractional baht rounds through fromBaht', () => {
    const draft = setCell(clean, 'tier_ws', 'var_wc', '12.345');
    expect(diffDraft(rows, draft, 'tier_ws')).toEqual([{ variantId: 'var_wc', price: 1235 }]);
  });

  test('invalid text is reported by validateDraft', () => {
    const draft = setCell(clean, 'tier_ws', 'var_hoe', 'abc');
    const issues = validateDraft(draft);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.tierId).toBe('tier_ws');
    expect(issues[0]?.variantId).toBe('var_hoe');
  });
});
