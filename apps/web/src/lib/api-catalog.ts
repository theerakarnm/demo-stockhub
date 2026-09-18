/**
 * Catalog search + listing endpoints: GET /catalog/search, POST /listings.
 *
 * Same plumbing as api-client.ts - demo() picks the mock in demo mode,
 * request() unwraps the error envelope - but in its own module, because the
 * main client file belongs to the whole team and this domain ships separately.
 */

import { demo, request, withQuery } from './api-core';
import type { CatalogSearchRow, SaveListingInput, SaveListingResult } from './api-types-catalog';
import { mockCatalogApi } from './mock-catalog';

export const catalogApi = {
  /** GET /api/v1/catalog/search - every row carries its live on-hand number. */
  search: (q: string, limit = 10): Promise<CatalogSearchRow[]> =>
    demo(
      () => mockCatalogApi.search(q, limit),
      () => request<CatalogSearchRow[]>(withQuery('/api/v1/catalog/search', { q, limit })),
    ),

  /** POST /api/v1/listings - save a mapping and re-match the open order lines. */
  saveListing: (input: SaveListingInput): Promise<SaveListingResult> =>
    demo(
      () => mockCatalogApi.saveListing(input),
      () => request<SaveListingResult>('/api/v1/listings', { method: 'POST', body: input }),
    ),
};

export type CatalogApi = typeof catalogApi;
