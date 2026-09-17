/**
 * Import pipeline orchestration - the heart of the product.
 *
 * Stock is never typed in by hand for a marketplace. It is deducted by importing
 * the order export file each platform gives the seller. Five steps, three HTTP
 * calls:
 *
 *   POST /imports            upload    -> uploadImport()
 *                            1. read the multipart file into bytes
 *                            2. create an import_batches row (status 'uploaded')
 *                            3. PUT the original bytes to R2 at importObjectKey()
 *                               (keep it forever: it is the audit evidence)
 *                            4. detectAdapter(file) -> which marketplace is this
 *                            5. adapter.parse(file, { timeZone }) -> NormalizedOrder[]
 *                            6. build the MatchIndex from channel_listings +
 *                               variants, matchSku() every line
 *                            7. persist the preview + issues, status 'preview_ready'
 *
 *   GET  /imports/:id        review    -> getImportPreview()
 *   POST /imports/:id/match  fix a SKU -> saveManualMatch()  (writes channel_listings,
 *                            so the NEXT import matches it automatically)
 *   POST /imports/:id/apply  commit    -> applyImport()
 *
 * Parsing is deliberately separate from applying: the user must see what will
 * happen to stock before anything moves. That is also why an unmatched SKU
 * blocks the apply instead of being silently ignored.
 */

import { NotImplementedError, importObjectKey } from '@stockhub/core';
import type { ImportBatchId, RawImportFile, VariantId } from '@stockhub/core';
import type { ApplyImportBody, CreateImportForm } from '../schemas/imports';
import type { ApplyImportResult, ImportBatch, ImportPreviewResponse } from '../types/contract';
import type { ServiceContext } from './context';

export interface UploadImportInput extends CreateImportForm {
  file: RawImportFile;
}

/** Alias of the wire shape: the preview is returned to the client unchanged. */
export type ImportPreview = ImportPreviewResponse;

/**
 * Steps 1-7 above.
 *
 * Ordering rule: write the file to R2 BEFORE parsing. If the parser crashes on
 * a weird export we still have the file to reproduce with, and the batch row
 * ends as 'failed' with a real object key instead of nothing.
 *
 * Idempotency: `externalOrderId` is unique per channel. Re-uploading the same
 * export must update, never duplicate, so apply() can be retried safely.
 */
export const uploadImport = async (
  ctx: ServiceContext,
  input: UploadImportInput,
): Promise<ImportBatch> => {
  // The key layout is already decided by core, so every caller agrees on it.
  const _key = importObjectKey({
    orgId: ctx.auth.orgId,
    // Real code generates the id first (uuid v7) so the key can contain it.
    importBatchId: 'batch_pending',
    fileName: input.file.fileName,
    now: ctx.clock.now(),
  });
  // await ctx.storage.put(_key, input.file.bytes, input.file.contentType);
  // const detected = await detectAdapter(input.file);
  // const parsed = await detected.adapter.parse(input.file, { timeZone: input.timeZone });
  // ... persist batch + preview rows through ctx.db()
  throw new NotImplementedError('uploadImport');
};

/**
 * Read back a parsed batch for the preview screen.
 *
 * `unmatched` is grouped by platform SKU and ordered by quantity desc, so the
 * user fixes the line that moves the most stock first. Suggestions come from
 * matchSku()'s `suggestions`, which is why the matcher returns them.
 */
export const getImportPreview = async (
  _ctx: ServiceContext,
  _batchId: ImportBatchId,
): Promise<ImportPreview> => {
  throw new NotImplementedError('getImportPreview');
};

/**
 * Map one platform SKU to an internal variant, permanently.
 *
 * Writes a channel_listings row (channelId + platformSku -> variantId) and
 * re-matches the open preview lines that used that SKU. After this the batch's
 * unmatchedCount drops and, on the next import, matchSku() returns source
 * 'listing_map' without asking anyone.
 */
export const saveManualMatch = async (
  _ctx: ServiceContext,
  _batchId: ImportBatchId,
  _input: { platformSku: string; variantId: VariantId },
): Promise<{ unmatchedRemaining: number }> => {
  throw new NotImplementedError('saveManualMatch');
};

/**
 * Commit the batch. EVERYTHING here happens in ONE transaction.
 *
 *   await ctx.db().transaction(async (tx) => {
 *     1. re-read the batch FOR UPDATE and refuse unless status = 'preview_ready'
 *        (guards a double click on "ยืนยัน")
 *     2. refuse if unmatchedCount > 0 and !body.ignoreUnmatched  -> UnmatchedSkuError
 *     3. upsert orders + order_lines from the preview (idempotent on
 *        channelId + externalOrderId)
 *     4. expandBundles(lines, componentsByBundle)   <- a bundle owns no stock
 *     5. lock every affected variant's open lots: SELECT ... FOR UPDATE
 *        ORDER BY received_at, id   (consistent lock order avoids deadlocks)
 *     6. planMovements({ reason: 'sale_out' | 'cancel_restore' | 'return_in' }, { lotsByVariant })
 *        - marketplace sales use consumeFifo(..., { onShortage: 'shortfall' }):
 *          the sale already happened in the real world, so report the shortfall
 *          instead of refusing the import
 *        - a cancelled or returned order restores the ORIGINAL consumption with
 *          restoreFifo(), never today's cost
 *     7. insert stock_movements + movement_lot_consumptions, update stock_lots
 *     8. status = 'applied', appliedAt = clock.now()
 *   });
 *
 * Returns the numbers the UI shows in the success toast. `cogs` is a cost field
 * and is stripped for roles without `cost:read` by lib/response.ts.
 */
export const applyImport = async (
  _ctx: ServiceContext,
  _batchId: ImportBatchId,
  _body: ApplyImportBody,
): Promise<ApplyImportResult> => {
  throw new NotImplementedError('applyImport');
};

/** List batches for the imports screen, newest first. */
export const listImports = async (_ctx: ServiceContext): Promise<ImportBatch[]> => {
  throw new NotImplementedError('listImports');
};
