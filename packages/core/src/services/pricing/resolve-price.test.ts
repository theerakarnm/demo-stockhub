import { describe, expect, test } from 'bun:test';
import { asPriceTierId, asVariantId } from '../../domain/ids';
import { type Satang, fromBaht } from '../../domain/money';
import { resolvePrice, tierPriceKey } from './resolve-price';

const variant = asVariantId('V-HOE');
const tier = asPriceTierId('tier-wholesale');
const defaultTier = asPriceTierId('tier-retail');
const tierPrices = new Map<string, Satang>([
  [tierPriceKey(tier, variant), fromBaht(167)],
]);

describe('resolvePrice', () => {
  test('a tier hit wins', () => {
    const r = resolvePrice({ variantId: variant, sellingPrice: fromBaht(185), tierId: tier, tierPrices });
    expect(r).toEqual({ variantId: variant, price: fromBaht(167), source: 'tier', tierId: tier });
  });

  test('a tier miss falls back to the default tier', () => {
    const other = asVariantId('V-GLOVE');
    const prices = new Map<string, Satang>([[tierPriceKey(defaultTier, other), fromBaht(35)]]);
    const r = resolvePrice({
      variantId: other,
      sellingPrice: fromBaht(45),
      tierId: tier,
      defaultTierId: defaultTier,
      tierPrices: prices,
    });
    expect(r).toEqual({ variantId: other, price: fromBaht(35), source: 'default_tier', tierId: defaultTier });
  });

  test('both miss and the standard selling price is used', () => {
    const r = resolvePrice({
      variantId: variant,
      sellingPrice: fromBaht(185),
      tierId: tier,
      defaultTierId: defaultTier,
      tierPrices: new Map(),
    });
    expect(r).toEqual({ variantId: variant, price: fromBaht(185), source: 'selling_price' });
    expect(r.tierId).toBeUndefined();
  });

  test('the default tier is not consulted twice when it is the customer tier', () => {
    const r = resolvePrice({
      variantId: variant,
      sellingPrice: fromBaht(185),
      tierId: defaultTier,
      defaultTierId: defaultTier,
      tierPrices: new Map(),
    });
    expect(r).toEqual({ variantId: variant, price: fromBaht(185), source: 'selling_price' });
  });

  test('the price is the exact satang integer from the map', () => {
    const prices = new Map<string, Satang>([[tierPriceKey(tier, variant), 12_345 as Satang]]);
    const r = resolvePrice({ variantId: variant, sellingPrice: fromBaht(185), tierId: tier, tierPrices: prices });
    expect(r.price).toBe(12_345 as Satang);
  });
});
