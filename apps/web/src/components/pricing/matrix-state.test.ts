/**
 * Pure tests for the price matrix draft state. No React, no network.
 */

import { describe, expect, test } from 'bun:test';
import type { PriceMatrixRow, PriceTierView } from '@/lib/api-types-pricing';
import { diffDraft, dirtyCount, initDraft, setCell, validateDraft } from './matrix-state';

const TIERS: PriceTierView[] = [
  { id: 'tier_retail', code: 'retail', name: 'ราคาปลีก', sortOrder: 1, isDefault: true },
  { id: 'tier_wholesale', code: 'wholesale', name: 'ราคาส่ง', sortOrder: 2, isDefault: false },
];

const rowOf = (variantId: string, wholesale?: number): PriceMatrixRow => ({
  variantId,
  sku: variantId.toUpperCase(),
  name: variantId,
  sellingPrice: 18_500,
  tierPrices: wholesale === undefined ? {} : { tier_wholesale: wholesale },
});

describe('matrix state', () => {
  test('diffDraft yields exactly one cell for one edit', () => {
    const rows = [rowOf('var_a', 16_700), rowOf('var_b', 14_900)];
    const original = initDraft(rows, TIERS);
    const draft = setCell(original, 'tier_wholesale', 'var_a', '160');
    expect(diffDraft(original, draft, 'tier_wholesale')).toEqual([
      { variantId: 'var_a', price: 16_000 },
    ]);
  });

  test('clearing a priced cell yields a null price (delete)', () => {
    const rows = [rowOf('var_a', 16_700)];
    const original = initDraft(rows, TIERS);
    const draft = setCell(original, 'tier_wholesale', 'var_a', '');
    expect(diffDraft(original, draft, 'tier_wholesale')).toEqual([
      { variantId: 'var_a', price: null },
    ]);
  });

  test('unchanged text yields nothing', () => {
    const rows = [rowOf('var_a', 16_700), rowOf('var_b')];
    const original = initDraft(rows, TIERS);
    // 16.700 baht stays 16.700 baht, and the empty cell stays empty.
    const draft = setCell(
      setCell(original, 'tier_wholesale', 'var_a', '167'),
      'tier_wholesale',
      'var_b',
      '',
    );
    expect(diffDraft(original, draft, 'tier_wholesale')).toEqual([]);
  });

  test('a fractional baht text rounds to the nearest satang', () => {
    const rows = [rowOf('var_a')];
    const original = initDraft(rows, TIERS);
    const draft = setCell(original, 'tier_wholesale', 'var_a', '12.345');
    expect(diffDraft(original, draft, 'tier_wholesale')).toEqual([
      { variantId: 'var_a', price: 1_235 },
    ]);
  });

  test('validateDraft reports text that is not a number', () => {
    const draft = setCell(
      setCell(initDraft([rowOf('var_a'), rowOf('var_b')], TIERS), 'tier_wholesale', 'var_a', 'abc'),
      'tier_wholesale',
      'var_b',
      '150',
    );
    const issues = validateDraft(draft);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.variantId).toBe('var_a');
    expect(issues[0]?.tierId).toBe('tier_wholesale');
    // dirtyCount still counts the invalid cell: it IS a change the user made.
    expect(dirtyCount(initDraft([rowOf('var_a'), rowOf('var_b')], TIERS), draft)).toBe(2);
  });
});
