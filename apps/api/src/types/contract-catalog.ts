/**
 * Wire contract for catalog and listing endpoints.
 *
 * Consumed by the web app (apps/web/src/lib/api-types-catalog.ts must mirror
 * this file field for field) and by the import preview screen. It is
 * re-exported from ./contract.ts from day one.
 */

import type { MatchSource, VariantKind } from '@stockhub/core';
import type { MoneyOnWire } from './contract';

/** One row of GET /api/v1/catalog/search - the SKU picker result line. */
export interface CatalogSearchRow {
  variantId: string;
  sku: string;
  /** Product name plus the variant label, e.g. "ปุ๋ยเคมี (ขนาด 50 กก.)". */
  name: string;
  kind: VariantKind;
  /** Selling unit, e.g. "ชิ้น", "ชุด". */
  unit: string;
  sellingPrice: MoneyOnWire;
  /** Live on-hand, so the picker can grey out what the shop cannot ship. */
  onHand: number;
}

/** Body of POST /api/v1/listings. */
export interface SaveListingInput {
  channelId: string;
  /** SKU exactly as the platform export prints it; stored verbatim. */
  platformSku: string;
  /** Product name as printed on the platform, kept for the preview screen. */
  platformProductName?: string;
  variantId: string;
}

export interface SaveListingResult {
  listingId: string;
  channelId: string;
  platformSku: string;
  variantId: string;
  /** How many still-unmatched order lines the save re-matched to the variant. */
  linesUpdated: number;
}

/** One row of GET /api/v1/listings - a learned platform-SKU mapping. */
export interface ListingView {
  id: string;
  channelId: string;
  platformSku: string;
  platformProductName: string | null;
  /** Null marks a listing the shop deliberately ignores (e.g. a freebie). */
  variantId: string | null;
  variantSku: string | null;
  matchSource: MatchSource;
}
