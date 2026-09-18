/**
 * Pure tests for bill repricing: which lines take a tier price, which keep
 * what the cashier typed, and the Thai captions per price source.
 */

import { describe, expect, test } from 'bun:test';
import type { PriceResolutionView } from '@/lib/api-types-pricing';
import type { CartLine } from './cart';
import { priceSourceLabel, repriceLines } from './reprice';

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

const resolution = (patch: Partial<PriceResolutionView> = {}): PriceResolutionView => ({
  variantId: 'var_hoe',
  price: 16_700,
  priceSource: 'tier',
  ...patch,
});

describe('repriceLines', () => {
  test('reprices an untouched line from its resolution', () => {
    const repriced = repriceLines([line()], [resolution({ price: 16_700 })]);
    expect(repriced[0]?.priceBaht).toBe('167.00');
    expect(repriced[0]?.priceSource).toBe('tier');
    expect(repriced[0]?.priceTouched).toBe(false);
  });

  test('skips a line the cashier edited by hand', () => {
    const touched = line({ priceBaht: '150.00', priceTouched: true });
    const repriced = repriceLines([touched], [resolution()]);
    expect(repriced[0]?.priceBaht).toBe('150.00');
    expect(repriced[0]?.priceSource).toBeUndefined();
  });

  test('leaves lines with no resolution alone', () => {
    const untouched = line({ priceBaht: '185.00' });
    const repriced = repriceLines([untouched], [resolution({ variantId: 'var_other' })]);
    expect(repriced[0]?.priceBaht).toBe('185.00');
    expect(repriced[0]?.priceSource).toBeUndefined();
  });

  test('labels every price source', () => {
    expect(priceSourceLabel('tier')).toBe('ราคาตามระดับลูกค้า');
    expect(priceSourceLabel('default_tier')).toBe('ราคาระดับเริ่มต้น');
    expect(priceSourceLabel('selling_price')).toBe('ราคาขายมาตรฐาน (ยังไม่ตั้งราคาระดับนี้)');
  });
});
