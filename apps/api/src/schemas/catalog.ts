/** Request schemas for catalog search and the listing endpoints. */

import { z } from 'zod';
import { idString } from './common';

export const catalogSearchQuery = z.object({
  /** Free text over SKU, product name and variant label. */
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type CatalogSearchQuery = z.infer<typeof catalogSearchQuery>;

export const saveListingBody = z.object({
  channelId: idString,
  platformSku: z.string().trim().min(1).max(120),
  platformProductName: z.string().trim().max(255).optional(),
  variantId: idString,
});

export type SaveListingBody = z.infer<typeof saveListingBody>;

export const listListingsQuery = z.object({
  channelId: idString.optional(),
});

export type ListListingsQuery = z.infer<typeof listListingsQuery>;
