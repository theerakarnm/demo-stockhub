/**
 * Price resolution rules for wholesale tiers.
 *
 * Why: a shop with 400 SKUs never fills every tier price, so a missing tier
 * price must fall back to something the cashier can defend. The source is
 * returned so the bill screen can show "ราคาปลีก (ยังไม่ตั้งราคาส่ง)".
 */

import type { PriceTierId, VariantId } from '../../domain/ids';
import type { Satang } from '../../domain/money';

export const PRICE_SOURCES = ['tier', 'default_tier', 'selling_price'] as const;

export type PriceSource = (typeof PRICE_SOURCES)[number];

export interface PriceResolution {
  variantId: VariantId;
  price: Satang;
  source: PriceSource;
  tierId?: PriceTierId;
}

/** Key of one tier price inside a tier price map, e.g. "tier_ws::var_hoe". */
export const tierPriceKey = (tierId: PriceTierId, variantId: VariantId): string =>
  `${tierId}::${variantId}`;

export const resolvePrice = (input: {
  variantId: VariantId;
  sellingPrice: Satang;
  tierId?: PriceTierId;
  defaultTierId?: PriceTierId;
  tierPrices: ReadonlyMap<string, Satang>;
}): PriceResolution => {
  const { variantId, sellingPrice, tierId, defaultTierId, tierPrices } = input;

  if (tierId !== undefined) {
    const price = tierPrices.get(tierPriceKey(tierId, variantId));
    if (price !== undefined) {
      return { variantId, price, source: 'tier', tierId };
    }
  }
  // The default tier is only consulted when it differs from the customer
  // tier; otherwise the miss above already proved this variant has no price.
  if (defaultTierId !== undefined && defaultTierId !== tierId) {
    const price = tierPrices.get(tierPriceKey(defaultTierId, variantId));
    if (price !== undefined) {
      return { variantId, price, source: 'default_tier', tierId: defaultTierId };
    }
  }
  return { variantId, price: sellingPrice, source: 'selling_price' };
};
