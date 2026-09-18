/** Query and body schemas for the catalog search and listing routes. */

import { z } from 'zod';
import { idString } from './common';

export const catalogSearchQuery = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type CatalogSearchQuery = z.infer<typeof catalogSearchQuery>;

/** A learned mapping. variantId must exist inside the caller's org (service checks). */
export const saveListingBody = z.object({
  channelId: idString,
  platformSku: z.string().trim().min(1).max(200),
  platformProductName: z.string().trim().max(500).optional(),
  variantId: idString,
});

export type SaveListingBody = z.infer<typeof saveListingBody>;

export const listListingsQuery = z.object({
  channelId: idString.optional(),
});

export type ListListingsQuery = z.infer<typeof listListingsQuery>;
