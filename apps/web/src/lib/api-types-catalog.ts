/**
 * Wire types for the catalog search and listing endpoints, base path /api/v1.
 *
 * Mirror of apps/api/src/types/contract-catalog.ts - if a field moves, change
 * BOTH sides in the same commit. Kept out of api-types.ts so parallel tracks
 * never edit the same file.
 *
 * Money rule: every money field is an INTEGER number of satang (1 THB = 100
 * satang), exactly like `Satang` in @stockhub/core. Format them with the
 * helpers in src/lib/format.ts, never with toFixed().
 */

import type { MatchSource, VariantKind } from '@stockhub/core';
import type { MoneyAmount } from './api-types';

/** One row of GET /api/v1/catalog/search - the SKU picker result line. */
export interface CatalogSearchRow {
  variantId: string;
  sku: string;
  /** Product name plus the variant label, e.g. "ปุ๋ยเคมี (ขนาด 50 กก.)". */
  name: string;
  kind: VariantKind;
  /** Selling unit, e.g. "ชิ้น", "ชุด". */
  unit: string;
  sellingPrice: MoneyAmount;
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
