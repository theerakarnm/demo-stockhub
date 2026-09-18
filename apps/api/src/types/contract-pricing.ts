/**
 * Wire contract for customer and price tier endpoints.
 *
 * Task 5 reserved the module; Tasks 31 and 32 own the interfaces here. Every
 * field whose name is in PRICE_TIER_KEYS (packages/core/src/rbac.ts) carries
 * the `/** tier field *` doc comment on the line above: that is how a reviewer
 * sees that the field is stripped for a role without `price_tier:read` once
 * Track E lands.
 */

import type { PriceSource } from '@stockhub/core';
import type { MoneyOnWire } from './contract';

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

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  /** tier field */
  priceTierId?: string | null;
  isActive?: boolean;
}

export interface TierPriceCell {
  variantId: string;
  price: MoneyOnWire | null;
}

export interface PriceMatrixRow {
  variantId: string;
  sku: string;
  name: string;
  sellingPrice: MoneyOnWire;
  /** tier field */
  tierPrices: Record<string, MoneyOnWire>;
}

export interface PriceResolutionView {
  variantId: string;
  price: MoneyOnWire;
  /** tier field */
  priceSource: PriceSource;
  /** tier field */
  priceTierId?: string;
}
