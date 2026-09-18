/**
 * Price resolution rules: what unit price a bill line should use for a variant,
 * given the customer's tier and the shop's tier price rows.
 *
 * A shop with hundreds of SKUs never fills every cell of the tier matrix, so a
 * missing tier price must fall back to a price the cashier can still defend.
 * The returned `source` lets the bill screen show why a line has its price,
 * e.g. "ราคาขายมาตรฐาน (ยังไม่ตั้งราคาส่ง)".
 */

import type { PriceTierId, VariantId } from '../../domain/ids';
import type { Satang } from '../../domain/money';

export const PRICE_SOURCES = ['tier', 'default_tier', 'selling_price'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export interface PriceResolution {
  variantId: VariantId;
  price: Satang;
  source: PriceSource;
  /** Set when the winning price came from a tier row (the customer's or the default tier). */
  tierId?: PriceTierId;
}

/** Composite key of one tier-price cell; repositories use the same format. */
export const tierPriceKey = (tierId: PriceTierId, variantId: VariantId): string =>
  `${tierId}::${variantId}`;

export interface ResolvePriceInput {
  variantId: VariantId;
  /** The standard selling price, the last fallback of the chain. */
  sellingPrice: Satang;
  /** The customer's own tier, if the customer has one. */
  tierId?: PriceTierId;
  /** The org's default tier (e.g. retail), applied when the customer has none or misses a cell. */
  defaultTierId?: PriceTierId;
  tierPrices: ReadonlyMap<string, Satang>;
}

export const resolvePrice = (input: ResolvePriceInput): PriceResolution => {
  const { variantId, sellingPrice, tierId, defaultTierId, tierPrices } = input;
  if (tierId !== undefined) {
    const hit = tierPrices.get(tierPriceKey(tierId, variantId));
    if (hit !== undefined) return { variantId, price: hit, source: 'tier', tierId };
  }
  // A customer whose own tier lacks the cell still deserves the default tier's
  // price, but never twice: the same tier is not consulted again.
  if (defaultTierId !== undefined && defaultTierId !== tierId) {
    const hit = tierPrices.get(tierPriceKey(defaultTierId, variantId));
    if (hit !== undefined)
      return { variantId, price: hit, source: 'default_tier', tierId: defaultTierId };
  }
  return { variantId, price: sellingPrice, source: 'selling_price' };
};
