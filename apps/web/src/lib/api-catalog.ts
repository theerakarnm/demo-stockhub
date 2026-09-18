/**
 * Catalog search + learned listings client.
 *
 * Mirrors the endpoints in apps/api/src/routes/catalog.ts and listings.ts;
 * the fetch/envelope plumbing is the shared request core in ./api-core.
 */

import { demo, request, withQuery } from './api-core';
import type { CatalogSearchRow, SaveListingInput, SaveListingResult } from './api-types-catalog';
import { mockCatalogApi } from './mock-catalog';

export const catalogApi = {
  /** GET /api/v1/catalog/search */
  search: (q: string, limit?: number): Promise<CatalogSearchRow[]> =>
    demo(
      () => mockCatalogApi.search(q, limit),
      () => request<CatalogSearchRow[]>(withQuery('/api/v1/catalog/search', { q, limit })),
    ),

  /** POST /api/v1/listings */
  saveListing: (input: SaveListingInput): Promise<SaveListingResult> =>
    demo(
      () => mockCatalogApi.saveListing(input),
      () => request<SaveListingResult>('/api/v1/listings', { method: 'POST', body: input }),
    ),
};
