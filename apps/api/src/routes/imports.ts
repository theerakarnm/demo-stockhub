/**
 * IMPORT FLOW - the feature the whole product is built around.
 *
 * Stock is not typed in by hand. The seller downloads an order export from each
 * marketplace and uploads it here. Full intended flow:
 *
 *   1. POST /api/v1/imports  (multipart: file, channelId?)
 *        a. read the File into Uint8Array -> RawImportFile
 *        b. create the import_batches row (status 'uploaded') to get an id
 *        c. storage.put(importObjectKey({orgId, importBatchId, fileName}), bytes)
 *           via the StoragePort (adapters/r2-storage.ts). Keep the original file
 *           forever: it is the evidence behind every movement it creates.
 *        d. detectAdapter(file) -> { adapter, detection } from the registry
 *           (or adapterForKind when the user picked the channel explicitly)
 *        e. adapter.parse(file, { timeZone }) -> { orders, issues, stats }
 *           An adapter never throws on a bad row; it reports it in `issues`, so
 *           one broken line cannot kill a 2,000 line import.
 *        f. build the MatchIndex (channel_listings + variants) and matchSku()
 *           every line: listing_map -> sku_exact -> sku_normalised -> unmatched
 *        g. persist preview rows, status 'preview_ready'
 *
 *   2. GET /api/v1/imports/:id
 *        Show the preview: orders, issues, and unmatched SKUs with suggestions.
 *        NOTHING has moved in stock yet. That is the point of a preview.
 *
 *   3. POST /api/v1/imports/:id/match  { platformSku, variantId }
 *        The user maps a leftover SKU. Saved as a channel_listing, so the next
 *        import matches it automatically with source 'listing_map'.
 *
 *   4. POST /api/v1/imports/:id/apply
 *        ONE transaction: upsert orders -> expandBundles -> lock lots FOR UPDATE
 *        -> planMovements -> consumeFifo (marketplace sales use
 *        onShortage:'shortfall', a real sale already happened) -> write
 *        stock_movements + lot consumptions -> status 'applied'.
 *        Returns { movementsCreated, ordersApplied, cogs? }.
 */

import { StockHubError, asImportBatchId, asVariantId } from '@stockhub/core';
import type { RawImportFile } from '@stockhub/core';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { MOCK_IMPORT_BATCHES, MOCK_PREVIEW_ORDERS, MOCK_UNMATCHED } from '../lib/mock-data';
import { ok } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import {
  MAX_UPLOAD_BYTES,
  applyImportBody,
  createImportForm,
  importParam,
  matchSkuBody,
} from '../schemas/imports';
import { serviceContext } from '../services/context';
import { applyImport, saveManualMatch, uploadImport } from '../services/import-service';
import type { AppEnv } from '../types/app';
import type { ImportBatch, ImportPreviewResponse } from '../types/contract';

/**
 * Read the multipart body into the port type.
 *
 * Done in the route, not in the service, because `File` is an HTTP concern. The
 * service only ever sees bytes, which is what makes it unit testable.
 */
const readUpload = async (c: Context<AppEnv>) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    throw new StockHubError('validation_error', 'ต้องแนบไฟล์ในฟิลด์ "file"');
  }
  if (file.size === 0) {
    throw new StockHubError('validation_error', 'ไฟล์ว่าง');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new StockHubError('validation_error', 'ไฟล์ใหญ่เกินกำหนด', {
      size: file.size,
      maxBytes: MAX_UPLOAD_BYTES,
    });
  }
  const form = createImportForm.parse({
    channelId: typeof body.channelId === 'string' ? body.channelId : undefined,
    timeZone: typeof body.timeZone === 'string' ? body.timeZone : undefined,
  });
  const raw: RawImportFile = {
    fileName: file.name,
    // Browsers lie about this for .csv / .xlsx, so adapters sniff the content.
    contentType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
  return { raw, form };
};

export const importsRouter = new Hono<AppEnv>()
  .get('/', requirePermission('import:run'), (c) => {
    // MOCK: replace with
    //   SELECT * FROM import_batches WHERE org_id = $orgId ORDER BY uploaded_at DESC LIMIT 50
    const batches: ImportBatch[] = MOCK_IMPORT_BATCHES;
    return ok(c, batches);
  })

  .post('/', requirePermission('import:run'), async (c) => {
    const { raw, form } = await readUpload(c);
    // Step 1 above. The service throws NotImplementedError today -> HTTP 501,
    // which the upload screen shows as "ยังไม่รองรับ" instead of pretending.
    const batch = await uploadImport(serviceContext(c), { ...form, file: raw });
    return ok(c, batch, 201);
  })

  .get('/:id', requirePermission('import:run'), validate('param', importParam), (c) => {
    const { id } = c.req.valid('param');

    // MOCK: replace with `await getImportPreview(serviceContext(c), asImportBatchId(id))`.
    const batch = MOCK_IMPORT_BATCHES.find((candidate) => candidate.id === id);
    if (!batch) {
      throw new StockHubError('not_found', `Import batch ${id} not found`, { id });
    }
    const preview: ImportPreviewResponse = {
      batch,
      orders: MOCK_PREVIEW_ORDERS,
      issues: [
        {
          severity: 'warning',
          row: 41,
          column: 'จำนวน',
          code: 'quantity_not_numeric',
          message: 'อ่านจำนวนไม่ได้ ข้ามแถวนี้',
        },
        {
          severity: 'warning',
          row: 58,
          code: 'order_cancelled',
          message: 'ออเดอร์ถูกยกเลิก จะคืนสต๊อกให้อัตโนมัติ',
        },
      ],
      unmatched: batch.unmatchedCount > 0 ? MOCK_UNMATCHED : [],
    };
    return ok(c, preview);
  })

  .post(
    '/:id/match',
    requirePermission('import:run'),
    validate('param', importParam),
    validate('json', matchSkuBody),
    async (c) => {
      const { id } = c.req.valid('param');
      const { platformSku, variantId } = c.req.valid('json');
      // Step 3: this write is what makes the system learn a marketplace SKU once.
      const result = await saveManualMatch(serviceContext(c), asImportBatchId(id), {
        platformSku,
        variantId: asVariantId(variantId),
      });
      return ok(c, result);
    },
  )

  .post(
    '/:id/apply',
    requirePermission('import:run'),
    validate('param', importParam),
    async (c) => {
      const { id } = c.req.valid('param');
      // The confirm button may send no body at all, so parse defensively instead
      // of with validate('json'), which requires a JSON body to exist.
      const body = applyImportBody.parse(await c.req.json().catch(() => undefined));
      // Step 4: single transaction. `cogs` in the result is a cost field and is
      // stripped by ok() for a role without cost:read.
      const result = await applyImport(serviceContext(c), asImportBatchId(id), body);
      return ok(c, result);
    },
  );
