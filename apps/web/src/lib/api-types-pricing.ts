/**
 * Wire types for customers, price tiers and price resolution.
 *
 * Mirrors apps/api/src/types/contract-pricing.ts one to one; money stays an
 * integer in satang on the wire and is formatted only at render time.
 */

/** What price won for a variant (see resolvePrice in @stockhub/core). */
export type PriceSource = 'tier' | 'default_tier' | 'selling_price';

/** One row of the tier list shown in settings and in the customer form. */
export interface PriceTierView {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
}

export interface CustomerView {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  isActive: boolean;
  priceTierId?: string;
  priceTierCode?: string;
  priceTierName?: string;
  createdAt: string;
}

/** Body of POST /customers and PATCH /customers/:id. `priceTierId: null` clears the tier. */
export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  priceTierId?: string | null;
  isActive?: boolean;
}

/** One cell written by PUT /price-tiers/:id/prices; `price: null` deletes it. */
export interface TierPriceCell {
  variantId: string;
  price: number | null;
}

/** One row of the price matrix screen: a variant and its tier price cells. */
export interface PriceMatrixRow {
  variantId: string;
  sku: string;
  name: string;
  sellingPrice: number;
  tierPrices: Record<string, number>;
}

/** What price a bill line should use and WHY (the bill shows the reason). */
export interface PriceResolutionView {
  variantId: string;
  price: number;
  priceSource: PriceSource;
  priceTierId?: string;
}

export interface PutTierPricesResult {
  upserted: number;
  deleted: number;
}
