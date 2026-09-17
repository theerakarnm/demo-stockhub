/** Schemas for the import flow (upload -> preview -> match -> apply). */

import { z } from 'zod';
import { idString } from './common';

/** 10 MB. A Shopee monthly export of a small shop is far below this. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * multipart/form-data body of POST /api/v1/imports.
 *
 * `file` is validated by hand in the route (File instances are not a zod
 * primitive). `channelId` is optional: when omitted the adapter registry
 * detects the platform from the file headers, and the route then picks the
 * org's channel of that kind.
 */
export const createImportForm = z.object({
  channelId: idString.optional(),
  /** Timezone of the export file. Shopee/Lazada TH exports carry no offset. */
  timeZone: z.string().min(1).max(64).default('Asia/Bangkok'),
});

export type CreateImportForm = z.infer<typeof createImportForm>;

export const importParam = z.object({ id: idString });

/**
 * Body of POST /api/v1/imports/:id/match.
 * Saving one row here creates a channel_listing so the next import of the same
 * platform SKU matches automatically with source 'listing_map'.
 */
export const matchSkuBody = z.object({
  platformSku: z.string().trim().min(1).max(160),
  variantId: idString,
});

export type MatchSkuBody = z.infer<typeof matchSkuBody>;

/** Body of POST /api/v1/imports/:id/apply. Empty today, kept for options. */
export const applyImportBody = z
  .object({
    /**
     * When true, apply the matched lines and leave the unmatched ones for later
     * instead of refusing the whole batch. Default false = all or nothing.
     */
    ignoreUnmatched: z.boolean().default(false),
  })
  .default({ ignoreUnmatched: false });

export type ApplyImportBody = z.infer<typeof applyImportBody>;
