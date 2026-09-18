/**
 * Pure tests for bill repricing: what the customer tier may and may not
 * overwrite. No React, no network.
 */

import { describe, expect, test } from 'bun:test';
import type { CartLine } from './cart';
import { priceSourceLabel, repriceLines } from './reprice';

const lineOf = (variantId: string, priceBaht: string, priceTouched = false): CartLine => ({
  variantId,
  sku: variantId.toUpperCase(),
  name: variantId,
  unit: 'ชิ้น',
  available: 10,
  quantity: 1,
  priceBaht,
  discountBaht: '0',
  priceTouched,
});

const RESOLUTIONS = [
  {
    variantId: 'var_hoe',
    price: 16_700,
    priceSource: 'tier' as const,
    priceTierId: 'tier_wholesale',
  },
  { variantId: 'var_can', price: 14_500, priceSource: 'selling_price' as const },
];

describe('reprice', () => {
  test('reprices an untouched line from the resolution', () => {
    const lines = repriceLines([lineOf('var_hoe', '185.00')], RESOLUTIONS);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.priceBaht).toBe('167.00');
    expect(lines[0]?.priceSource).toBe('tier');
    expect(lines[0]?.priceTouched).toBe(false);
  });

  test('skips a line the cashier priced by hand', () => {
    const lines = repriceLines([lineOf('var_hoe', '150.00', true)], RESOLUTIONS);
    expect(lines[0]?.priceBaht).toBe('150.00');
    expect(lines[0]?.priceSource).toBeUndefined();
  });

  test('leaves lines with no resolution alone', () => {
    const lines = repriceLines([lineOf('var_rake', '120.00')], RESOLUTIONS);
    expect(lines[0]?.priceBaht).toBe('120.00');
    expect(lines[0]?.priceSource).toBeUndefined();
  });

  test('labels every price source in Thai', () => {
    expect(priceSourceLabel('tier')).toBe('ราคาตามระดับลูกค้า');
    expect(priceSourceLabel('default_tier')).toBe('ราคาระดับเริ่มต้น');
    expect(priceSourceLabel('selling_price')).toBe('ราคาขายมาตรฐาน (ยังไม่ตั้งราคาระดับนี้)');
  });
});
