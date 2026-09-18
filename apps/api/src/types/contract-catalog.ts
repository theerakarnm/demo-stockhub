/**
 * Wire contract for catalog and listing endpoints.
 *
 * Task 5 reserved the module so Track C (Task 24) can add interfaces here
 * without touching the contract barrel. Re-exported from ./contract.ts, which
 * is what apps/web mirrors field for field.
 */

import type { MatchSource, VariantKind } from '@stockhub/core';
import type { MoneyOnWire } from './contract';

/** One row of catalog search - what the SKU picker offers for a query. */
export interface CatalogSearchRow {
  variantId: string;
  sku: string;
  name: string;
  kind: VariantKind;
  unit: string;
  sellingPrice: MoneyOnWire;
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
