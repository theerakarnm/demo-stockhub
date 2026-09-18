/**
 * Wire types for the catalog search and listing endpoints, base path /api/v1.
 *
 * Mirrors apps/api/src/types/contract-catalog.ts field for field - if a field
 * moves, change BOTH sides in the same commit.
 */

import type { MatchSource, VariantKind } from '@stockhub/core';
import type { MoneyAmount } from './api-types';

/** One row of catalog search - what the SKU picker offers for a query. */
export interface CatalogSearchRow {
  variantId: string;
  sku: string;
  name: string;
  kind: VariantKind;
  unit: string;
  sellingPrice: MoneyAmount;
  /** Open lots across the org's warehouses, so the picker can grey out rows. */
  onHand: number;
}

/** Body of POST /api/v1/listings - one learned platform-SKU mapping. */
export interface SaveListingInput {
  channelId: string;
  platformSku: string;
  platformProductName?: string;
  variantId: string;
}

/** Result of saving a mapping. `linesUpdated` is the import preview's undo log. */
export interface SaveListingResult {
  listingId: string;
  channelId: string;
  platformSku: string;
  variantId: string;
  linesUpdated: number;
}

/** One channel_listings row as the listings screen shows it. */
export interface ListingView {
  id: string;
  channelId: string;
  platformSku: string;
  platformProductName: string | null;
  /** null is the deliberate 'ignore this SKU' marker, not an error. */
  variantId: string | null;
  variantSku: string | null;
  matchSource: MatchSource;
}
