import { describe, expect, test } from 'bun:test';
import { asPriceTierId, asVariantId } from '../../domain/ids';
import { type Satang, satang } from '../../domain/money';
import { resolvePrice, tierPriceKey } from './resolve-price';

const variantId = asVariantId('var_hoe_01');
const dryVariantId = asVariantId('var_glove_01');
const wholesale = asPriceTierId('tier_wholesale');
const retail = asPriceTierId('tier_retail');
const dealer = asPriceTierId('tier_dealer');

const tierPrices = new Map<string, Satang>([
  [tierPriceKey(wholesale, variantId), satang(16_700)],
  [tierPriceKey(retail, variantId), satang(18_500)],
]);

const sellingPrice = satang(18_500);

describe('resolvePrice', () => {
  test('uses the customer tier price when it exists', () => {
    const resolution = resolvePrice({
      variantId,
      sellingPrice,
      tierId: wholesale,
      tierPrices,
    });

    expect(resolution.source).toBe('tier');
    expect(resolution.price).toBe(satang(16_700));
    expect(resolution.tierId).toBe(wholesale);
  });

  test('falls back to the default tier when the customer tier misses', () => {
    const resolution = resolvePrice({
      variantId,
      sellingPrice,
      tierId: dealer,
      defaultTierId: wholesale,
      tierPrices,
    });

    expect(resolution.source).toBe('default_tier');
    expect(resolution.price).toBe(satang(16_700));
    expect(resolution.tierId).toBe(wholesale);
  });

  test('uses the selling price when every tier misses', () => {
    const resolution = resolvePrice({
      variantId: dryVariantId,
      sellingPrice,
      tierId: dealer,
      defaultTierId: wholesale,
      tierPrices,
    });

    expect(resolution.source).toBe('selling_price');
    expect(resolution.price).toBe(satang(18_500));
    expect(resolution.tierId).toBeUndefined();
  });

  test('does not retry the default tier when it equals the customer tier', () => {
    const resolution = resolvePrice({
      variantId: dryVariantId,
      sellingPrice,
      tierId: wholesale,
      defaultTierId: wholesale,
      tierPrices,
    });

    expect(resolution.source).toBe('selling_price');
    expect(resolution.price).toBe(satang(18_500));
  });

  test('returns the exact satang integer stored in the map', () => {
    const resolution = resolvePrice({
      variantId,
      sellingPrice,
      tierId: retail,
      tierPrices,
    });

    expect(resolution.price).toBe(satang(18_500));
    expect(Number.isInteger(resolution.price)).toBe(true);
  });
});
