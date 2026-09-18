/**
 * Wire contract for customers, price tiers and price resolution.
 *
 * Marker rule (Global Constraints, audit-enforced by Tracks E and P): every
 * field whose name is in PRICE_TIER_KEYS carries `/** tier field *` + `/` on
 * the line above, the same way cost fields are marked in ./contract.ts. The
 * names themselves are: priceTierId, priceTierCode, priceTierName, tierPrices,
 * priceSource.
 */

import type { PriceSource } from '@stockhub/core';
import type { MoneyOnWire } from './contract';

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
  /** tier field */
  priceTierId?: string;
  /** tier field */
  priceTierCode?: string;
  /** tier field */
  priceTierName?: string;
  createdAt: string;
}

/** Body of POST /customers and PATCH /customers/:id. `priceTierId: null` clears the tier. */
export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  /** tier field */
  priceTierId?: string | null;
  isActive?: boolean;
}

/** One cell written by PUT /price-tiers/:id/prices; `price: null` deletes it. */
export interface TierPriceCell {
  variantId: string;
  price: MoneyOnWire | null;
}

/** One row of the price matrix screen: a variant and its tier price cells. */
export interface PriceMatrixRow {
  variantId: string;
  sku: string;
  name: string;
  sellingPrice: MoneyOnWire;
  /** tier field */
  tierPrices: Record<string, MoneyOnWire>;
}

/** What price a bill line should use and WHY (see resolvePrice in @stockhub/core). */
export interface PriceResolutionView {
  variantId: string;
  price: MoneyOnWire;
  /** tier field */
  priceSource: PriceSource;
  /** tier field */
  priceTierId?: string;
}
