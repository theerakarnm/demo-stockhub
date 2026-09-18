/**
 * Wire types for the customer and pricing endpoints.
 *
 * Mirrored from apps/api/src/types/contract-pricing.ts (Tasks 31-32). Fields
 * the API strips for roles without price_tier:read stay optional here, so a
 * redacted payload typechecks unchanged.
 */

import type { PriceSource } from '@stockhub/core';
import type { MoneyAmount } from './api-types';

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

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  /** Explicit null clears the customer tier; undefined leaves it alone. */
  priceTierId?: string | null;
  isActive?: boolean;
}

export interface TierPriceCell {
  variantId: string;
  price: MoneyAmount | null;
}

export interface PriceMatrixRow {
  variantId: string;
  sku: string;
  name: string;
  sellingPrice: MoneyAmount;
  tierPrices: Record<string, MoneyAmount>;
}

export interface PutTierPricesResult {
  upserted: number;
  deleted: number;
}

export interface PriceResolutionView {
  variantId: string;
  price: MoneyAmount;
  priceSource: PriceSource;
  priceTierId?: string;
}
