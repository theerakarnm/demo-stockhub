/**
 * Unit tests for the live availability merge of the bill screen.
 */

import { describe, expect, test } from 'bun:test';
import { balanceFetchKeyOf, mergeAvailability } from './availability';
import type { CartLine } from './cart';

const line = (patch: Partial<CartLine> = {}): CartLine => ({
  variantId: 'var_hoe',
  sku: 'HOE-001',
  name: 'จอบถางหญ้า',
  unit: 'ด้าม',
  available: 10,
  quantity: 1,
  priceBaht: '185.00',
  discountBaht: '0',
  priceTouched: false,
  ...patch,
});

describe('mergeAvailability', () => {
  test('patches the available balance of a line', () => {
    const merged = mergeAvailability([line()], new Map([['var_hoe', 4]]));
    expect(merged[0]?.available).toBe(4);
  });

  test('keeps lines with no fresh balance untouched', () => {
    const original = [line(), line({ variantId: 'var_pump', available: 2 })];
    const merged = mergeAvailability(original, new Map([['var_hoe', 4]]));
    expect(merged[1]?.available).toBe(2);
  });

  test('returns the same array reference when nothing changed', () => {
    const original = [line()];
    expect(mergeAvailability(original, new Map([['var_hoe', 10]]))).toBe(original);
  });

  test('does not mutate the input lines', () => {
    const original = line();
    mergeAvailability([original], new Map([['var_hoe', 1]]));
    expect(original.available).toBe(10);
  });
});

describe('balanceFetchKeyOf', () => {
  test('de-duplicates and sorts so the key is stable across renders', () => {
    expect(balanceFetchKeyOf(['b', 'a', 'b'])).toBe('a,b');
    expect(balanceFetchKeyOf([])).toBe('');
  });
});
