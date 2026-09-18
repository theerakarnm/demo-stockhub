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

import { detectAdapter, getAdapter } from '@stockhub/adapters';
import {
  IMPORTABLE_CHANNEL_KINDS,
  StockHubError,
  asChannelId,
  asImportBatchId,
  asOrderId,
  asVariantId,
  asWarehouseId,
  expandBundles,
  importObjectKey,
  matchSku,
  planMovements,
  satang,
  stockEffectOf,
} from '@stockhub/core';
import type {
  ImportBatchId,
  ImportableChannelKind,
  LotConsumption,
  MatchCandidate,
  MatchIndex,
  MovementRequestLine,
  NormalizedOrder,
  OrderStatus,
  OrgId,
  ParseIssue,
  ParseResult,
  RawImportFile,
  Satang,
  StockLot,
  VariantId,
} from '@stockhub/core';
import {
  type Channel,
  type DbExecutor,
  type ImportBatch as ImportBatchRow,
  type ImportPreviewPayload,
  type PreviewLinePayload,
  type PreviewOrderPayload,
  type PreviewUnmatchedPayload,
  catalogRepo,
  channelRepo,
  importRepo,
  inventoryRepo,
  listingRepo,
  movementRepo,
  orderRepo,
  schema,
} from '@stockhub/db';
import { inArray } from 'drizzle-orm';
import type { ApplyImportBody, CreateImportForm } from '../schemas/imports';
import type {
  ApplyImportResult,
  ImportBatch,
  ImportPreviewGroups,
  ImportPreviewResponse,
  MatchSkuResult,
  PreviewOrder,
  PreviewOrderLine,
  PreviewSkippedOrder,
} from '../types/contract';
import type { ServiceContext } from './context';

export interface UploadImportInput extends CreateImportForm {
  file: RawImportFile;
}

/** Alias of the wire shape: the preview is returned to the client unchanged. */
export type ImportPreview = ImportPreviewResponse;

/** Display name shared with the other services, so pickers render identically. */
const displayName = (productName: string, variantName: string | null): string =>
  variantName ? `${productName} (${variantName})` : productName;

/** SHA-256 of the uploaded bytes, hex encoded. Detects a re-uploaded file. */
const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const isImportableKind = (kind: Channel['kind']): kind is ImportableChannelKind =>
  (IMPORTABLE_CHANNEL_KINDS as readonly string[]).includes(kind);

/**
 * Steps 1-7 above.
 *
 * Ordering rule: write the file to storage BEFORE parsing. If the parser crashes
 * on a weird export we still have the file to reproduce with, and the batch row
 * ends as 'failed' with a real object key instead of nothing.
 *
 * Idempotency: `externalOrderId` is unique per channel. Re-uploading the same
 * export must update, never duplicate, so apply() can be retried safely.
 */
export const uploadImport = async (
  ctx: ServiceContext,
  input: UploadImportInput,
): Promise<ImportBatch> => {
  const db = ctx.db();
  const orgId = ctx.auth.orgId;
  const bytes = input.file.bytes;

  // The id exists before the row so the object key can contain it, and every
  // failure below can still be attached to a visible failed batch row.
  const batchId = asImportBatchId(crypto.randomUUID());
  const key = importObjectKey({
    orgId,
    importBatchId: batchId,
    fileName: input.file.fileName,
    now: ctx.clock.now(),
  });
  const checksum = await sha256Hex(bytes);

  const batch = await importRepo.createBatch(db, {
    orgId,
    id: batchId,
    channelId: input.channelId === undefined ? undefined : asChannelId(input.channelId),
    fileName: input.file.fileName,
    r2ObjectKey: key,
    fileSize: bytes.byteLength,
    checksum,
    uploadedBy: ctx.auth.userId,
  });

  // Evidence first, parsing second: a crash in the parser must still leave the
  // original file in storage behind the failed batch row.
  await ctx.storage.put(key, bytes, input.file.contentType);

  /** Park the batch as failed with a Thai reason, then surface the error. */
  const failBatch = async (message: string) => {
    await importRepo.updateBatch(db, batchId, { status: 'failed', errorMessage: message });
  };

  // Adapter choice: an explicitly picked channel wins, otherwise the file
  // headers decide. A null detection is a validation error, not a crash: the
  // upload screen asks the user to pick the channel and try again.
  let kind: ImportableChannelKind;
  let channel: Channel | undefined;
  let detectionReason: string | undefined;
  if (input.channelId !== undefined) {
    const channels = await channelRepo.listChannels(db, { orgId });
    channel = channels.find((row) => row.id === input.channelId);
    if (!channel) {
      const message = 'ไม่พบช่องทางขายที่เลือก';
      await failBatch(message);
      throw new StockHubError('not_found', message, { channelId: input.channelId });
    }
    if (!isImportableKind(channel.kind)) {
      const message = 'ช่องทางที่เลือกไม่รองรับการนำเข้าไฟล์ออเดอร์';
      await failBatch(message);
      throw new StockHubError('validation_error', message, { channelKind: channel.kind });
    }
    kind = channel.kind;
  } else {
    const detected = await detectAdapter(input.file);
    if (!detected) {
      const message = 'ระบบไม่รู้จักแพลตฟอร์มของไฟล์นี้ กรุณาเลือกช่องทางขายก่อนอัปโหลด';
      await failBatch(message);
      throw new StockHubError('validation_error', message, { fileName: input.file.fileName });
    }
    kind = detected.kind;
    detectionReason = detected.reason;
    // Orders always belong to one channel, so the detected kind must resolve to
    // an actual channel of this org before any parse result is persisted.
    channel = await channelRepo.getChannelByKind(db, { orgId, kind });
    if (!channel) {
      const message = `ไม่พบช่องทางขายชนิด ${kind} ในระบบ กรุณาเพิ่มช่องทางก่อนนำเข้า`;
      await failBatch(message);
      throw new StockHubError('validation_error', message, { channelKind: kind });
    }
  }

  const adapter = getAdapter(kind);
  let parsed: ParseResult;
  try {
    parsed = await adapter.parse(input.file, { timeZone: input.timeZone });
  } catch (error) {
    // A parser crash means the file shape defeated the adapter. The original
    // bytes are already in storage behind this failed row for reproduction.
    const message = 'ระบบอ่านไฟล์นี้ไม่สำเร็จ ลองดาวน์โหลดไฟล์ใหม่จากแพลตฟอร์มแล้วอัปโหลดอีกครั้ง';
    await failBatch(message);
    throw new StockHubError('validation_error', message, {
      reason: error instanceof Error ? error.message : 'unknown parse error',
    });
  }

  // One index per file, never per row: a 2,000 line export must stay 2 queries.
  const index = await catalogRepo.buildMatchIndex(db, { orgId });
  const channelId = asChannelId(channel.id);
  const payload = await buildPreviewPayload(db, orgId, parsed.orders, channelId, index);

  // Same bytes as an already applied batch: keep the new batch, warn loudly,
  // and let the preview mark the orders the applier will skip instead of
  // deducting them a second time.
  const previous = await importRepo.findAppliedBatchByChecksum(db, {
    orgId,
    checksum,
    excludeBatchId: batchId,
  });
  const issues: ParseIssue[] = [...parsed.issues];
  if (previous) {
    issues.push({
      severity: 'warning',
      code: 'duplicate_checksum',
      message: 'ไฟล์นี้เคยถูกนำเข้าแล้ว ออเดอร์ที่ซ้ำจะไม่ถูกตัดสต็อกซ้ำ',
    });
  }

  await importRepo.updateBatch(db, batchId, {
    status: 'preview_ready',
    channelId,
    detectedKind: kind,
    detectionReason,
    rowsRead: parsed.stats.rowsRead,
    ordersParsed: parsed.stats.ordersParsed,
    issues,
    preview: payload,
  });

  const saved = await importRepo.getBatch(db, { orgId, batchId });
  if (!saved) throw new Error('Import batch vanished right after its own update');
  const [view] = await toBatchViews(db, orgId, [saved]);
  if (!view) throw new Error('Batch view mapping produced no row');
  return view;
};

/**
 * Match every parsed line against the listing map and the catalogue, then
 * group the leftovers by platform SKU (biggest quantity first).
 *
 * Decides nothing about stock: it only attaches `variantId` where a rule hits,
 * so the preview screen can show the work queue before anything is applied.
 */
const buildPreviewPayload = async (
  exec: DbExecutor,
  orgId: OrgId,
  orders: readonly NormalizedOrder[],
  channelId: ReturnType<typeof asChannelId>,
  index: MatchIndex,
): Promise<ImportPreviewPayload> => {
  const suggestionsBySku = new Map<string, MatchCandidate[]>();
  const payloadOrders: PreviewOrderPayload[] = orders.map((order) => ({
    externalOrderId: order.externalOrderId,
    status: order.status,
    orderedAt: order.orderedAt.toISOString(),
    shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
    buyerName: order.buyerName ?? null,
    grandTotal: order.grandTotal,
    lines: order.lines.map((line): PreviewLinePayload => {
      const result = matchSku(channelId, line.platformSku, index);
      if (result.source === 'unmatched' && !suggestionsBySku.has(line.platformSku)) {
        suggestionsBySku.set(line.platformSku, result.suggestions);
      }
      return {
        platformSku: line.platformSku,
        platformProductName: line.platformProductName,
        variationName: line.variationName ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        variantId: result.variantId ?? null,
        // Filled in right below, once every matched variant id is known.
        matchedSku: null,
        matchSource: result.source,
      };
    }),
  }));

  // One lookup for every matched line of the file keeps the SKU evidence
  // (`matchedSku`) in the payload even if the variant is renamed later.
  const variantIds = payloadOrders.flatMap((order) =>
    order.lines.flatMap((line) => (line.variantId ? [asVariantId(line.variantId)] : [])),
  );
  const variantById = await catalogRepo.getVariantsByIds(exec, { orgId, variantIds });
  for (const order of payloadOrders) {
    for (const line of order.lines) {
      if (!line.variantId) continue;
      line.matchedSku = variantById.get(asVariantId(line.variantId))?.sku ?? null;
    }
  }

  return {
    orders: payloadOrders,
    unmatched: groupUnmatched(payloadOrders, suggestionsBySku),
    linesParsed: payloadOrders.reduce((sum, order) => sum + order.lines.length, 0),
  };
};

/**
 * Group every unmatched line by platform SKU, biggest quantity first, so the
 * preview screen fixes the line that moves the most stock before the rest.
 * matchSku() hands back the same suggestions for the same SKU, so the first
 * occurrence's list is the group's list.
 */
const groupUnmatched = (
  orders: readonly PreviewOrderPayload[],
  suggestionsBySku: ReadonlyMap<
    string,
    readonly { variantId: string; sku: string; name: string; score?: number }[]
  >,
): PreviewUnmatchedPayload[] => {
  const groups = new Map<string, PreviewUnmatchedPayload>();
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.matchSource !== 'unmatched') continue;
      const existing = groups.get(line.platformSku);
      const group: PreviewUnmatchedPayload = existing ?? {
        platformSku: line.platformSku,
        platformProductName: line.platformProductName,
        quantity: 0,
        occurrences: 0,
        suggestions: (suggestionsBySku.get(line.platformSku) ?? []).map((candidate) => ({
          variantId: candidate.variantId,
          sku: candidate.sku,
          name: candidate.name,
          score: candidate.score ?? 0,
        })),
      };
      group.quantity += line.quantity;
      group.occurrences += 1;
      groups.set(line.platformSku, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.quantity - a.quantity);
};

/**
 * Read back a parsed batch for the preview screen.
 *
 * The response is rebuilt from the stored payload, never by re-parsing the
 * file: the parse result at upload time is the result of record, and the
 * original bytes stay in storage as evidence instead of a re-parse source.
 */
export const getImportPreview = async (
  ctx: ServiceContext,
  batchId: ImportBatchId,
): Promise<ImportPreview> => {
  const db = ctx.db();
  const orgId = ctx.auth.orgId;
  const batch = await importRepo.getBatch(db, { orgId, batchId });
  if (!batch) {
    throw new StockHubError('not_found', `Import batch ${batchId} not found`, { batchId });
  }
  const [view] = await toBatchViews(db, orgId, [batch]);
  if (!view) throw new Error('Batch view mapping produced no row');

  const payload = batch.preview;
  // Variant display data resolves live: renames show up on the next preview
  // load, while the payload's matchedSku stays as the upload-time evidence.
  const variantIds = (payload?.orders ?? []).flatMap((order) =>
    order.lines.flatMap((line) => (line.variantId ? [asVariantId(line.variantId)] : [])),
  );
  const variantById = await catalogRepo.getVariantsByIds(db, { orgId, variantIds });
  const orders: PreviewOrder[] = (payload?.orders ?? []).map((order) =>
    toWireOrder(order, view, variantById),
  );
  const groups = await groupPreviewOrders(db, orgId, batch, orders);

  return {
    batch: view,
    orders,
    issues: batch.issues,
    unmatched: payload?.unmatched ?? [],
    groups,
  };
};

/**
 * Sort the preview orders into ตัดได้ / ติดปัญหา SKU / ถูกข้าม.
 *
 * The skipped check reads the orders table live: whether a platform order is a
 * duplicate is a property of the database right now, not of the upload moment
 * (two files may have imported it since the batch was parsed).
 */
const groupPreviewOrders = async (
  exec: DbExecutor,
  orgId: OrgId,
  batch: ImportBatchRow,
  orders: readonly PreviewOrder[],
): Promise<ImportPreviewGroups> => {
  const externalIds = orders.map((order) => order.externalOrderId);
  const existing =
    batch.channelId === null
      ? []
      : await orderRepo.listOrdersByExternalIds(exec, {
          orgId,
          channelId: asChannelId(batch.channelId),
          externalIds,
        });
  const existingByExternal = new Map(existing.map((order) => [order.externalOrderId, order]));

  const willDeduct: PreviewOrder[] = [];
  const needsMatch: PreviewOrder[] = [];
  const skipped: PreviewSkippedOrder[] = [];
  for (const order of orders) {
    const hasUnmatched = order.lines.some((line) => line.matchSource === 'unmatched');
    const resting = order.status === 'cancelled' || order.status === 'returned';
    if (resting) {
      // A returned order is not a cancellation: the label must say so, or the
      // seller thinks the platform cancelled when the buyer sent it back.
      skipped.push({ order, reason: order.status === 'returned' ? 'returned' : 'cancelled' });
      continue;
    }
    if (existingByExternal.has(order.externalOrderId)) {
      skipped.push({ order, reason: 'already_imported' });
      continue;
    }
    if (hasUnmatched) {
      needsMatch.push(order);
      continue;
    }
    willDeduct.push(order);
  }
  return { willDeduct, needsMatch, skipped };
};

/** One stored order onto the wire, with the current variant names. */
const toWireOrder = (
  order: PreviewOrderPayload,
  view: ImportBatch,
  variantById: ReadonlyMap<VariantId, catalogRepo.VariantWithProduct>,
): PreviewOrder => ({
  externalOrderId: order.externalOrderId,
  channelKind: view.detectedKind ?? view.channelKind,
  status: order.status,
  orderedAt: order.orderedAt,
  ...(order.shippedAt ? { shippedAt: order.shippedAt } : {}),
  ...(order.buyerName ? { buyerName: order.buyerName } : {}),
  grandTotal: satang(order.grandTotal),
  lines: order.lines.map((line): PreviewOrderLine => {
    const variant = line.variantId ? variantById.get(asVariantId(line.variantId)) : undefined;
    return {
      platformSku: line.platformSku,
      platformProductName: line.platformProductName,
      ...(line.variationName ? { variationName: line.variationName } : {}),
      quantity: line.quantity,
      unitPrice: satang(line.unitPrice),
      discount: satang(line.discount),
      lineTotal: satang(line.quantity * line.unitPrice - line.discount),
      matchSource: line.matchSource,
      ...(variant ? { variantId: variant.id } : {}),
      ...(variant ? { variantSku: variant.sku } : {}),
      ...(variant ? { variantName: displayName(variant.productName, variant.name) } : {}),
    };
  }),
});

/**
 * Map one platform SKU to an internal variant, permanently.
 *
 * Writes a channel_listings row (channelId + platformSku -> variantId) and
 * re-matches the open preview lines that used that SKU. After this the batch's
 * unmatchedCount drops and, on the next import, matchSku() returns source
 * 'listing_map' without asking anyone.
 */
export const saveManualMatch = async (
  ctx: ServiceContext,
  batchId: ImportBatchId,
  input: { platformSku: string; variantId: VariantId },
): Promise<MatchSkuResult> => {
  const db = ctx.db();
  const orgId = ctx.auth.orgId;
  const batch = await importRepo.getBatch(db, { orgId, batchId });
  if (!batch) {
    throw new StockHubError('not_found', `Import batch ${batchId} not found`, { batchId });
  }
  // The learned listing is keyed by channel, so a batch without one cannot
  // learn: this only happens for a file whose detection never succeeded.
  if (batch.channelId === null) {
    throw new StockHubError('validation_error', 'แฟ้มนี้ยังไม่ผูกกับช่องทางขาย จึงจับคู่ไม่ได้', {
      batchId,
    });
  }
  const variant = await catalogRepo.getVariantById(db, { orgId, variantId: input.variantId });
  if (!variant) {
    throw new StockHubError('not_found', `Variant ${input.variantId} not found`, {
      variantId: input.variantId,
    });
  }

  const channelId = asChannelId(batch.channelId);
  let linesUpdated = 0;
  await db.transaction(async (tx) => {
    // One transaction on purpose: if the preview rewrite fails, the learned
    // listing must not survive either, or the next import would match lines
    // nobody saw on screen.
    await listingRepo.upsertListing(tx, {
      orgId,
      channelId,
      platformSku: input.platformSku,
      variantId: input.variantId,
      matchSource: 'manual',
    });
    // Previously imported orders keep their lines in order_lines; back-fill
    // those too, so their match state agrees with what the screen now shows.
    linesUpdated = await listingRepo.rematchOpenLines(tx, {
      orgId,
      channelId,
      platformSku: input.platformSku,
      variantId: input.variantId,
    });

    const payload = batch.preview;
    if (payload) {
      for (const order of payload.orders) {
        for (const line of order.lines) {
          if (line.platformSku !== input.platformSku) continue;
          if (line.matchSource === 'unmatched') {
            line.variantId = input.variantId;
            line.matchedSku = variant.sku;
            line.matchSource = 'manual';
            linesUpdated += 1;
          }
        }
      }
      // Recompute the groups from the updated lines: the matched SKU's group
      // disappears, every other group keeps its suggestions and counters.
      const suggestionsBySku = new Map(
        payload.unmatched.map((group) => [group.platformSku, group.suggestions]),
      );
      payload.unmatched = groupUnmatched(payload.orders, suggestionsBySku);
      await importRepo.updateBatch(tx, batchId, { preview: payload });
    }
    return linesUpdated;
  });

  const saved = await importRepo.getBatch(db, { orgId, batchId });
  return {
    linesUpdated,
    unmatchedRemaining: saved?.preview?.unmatched.length ?? 0,
  };
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
  ctx: ServiceContext,
  batchId: ImportBatchId,
  body: ApplyImportBody,
): Promise<ApplyImportResult> =>
  ctx.db().transaction(async (tx) => {
    const orgId = ctx.auth.orgId;

    // 1. Re-read FOR UPDATE: a double click on "ยืนยัน" runs this twice, and
    //    only the first caller can ever see status 'preview_ready'.
    const batch = await importRepo.getBatchForUpdate(tx, { orgId, batchId });
    if (!batch) {
      throw new StockHubError('not_found', `Import batch ${batchId} not found`, { batchId });
    }
    if (batch.status !== 'preview_ready') {
      throw new StockHubError('conflict', 'แฟ้มนี้ไม่ได้อยู่ในสถานะรอยืนยัน จึงนำเข้าซ้ำไม่ได้', {
        batchId,
        status: batch.status,
      });
    }
    const payload = batch.preview;
    if (!payload) {
      throw new StockHubError('conflict', 'แฟ้มนี้ยังไม่มีผลการอ่านไฟล์', { batchId });
    }
    if (batch.channelId === null) {
      throw new StockHubError('conflict', 'แฟ้มนี้ยังไม่ผูกกับช่องทางขาย', { batchId });
    }
    const channelId = asChannelId(batch.channelId);

    // 2. All-or-nothing gate: an unmatched SKU blocks the whole batch unless
    //    the caller explicitly leaves those orders for later.
    let orders = payload.orders;
    if (payload.unmatched.length > 0 && !body.ignoreUnmatched) {
      throw new StockHubError('unmatched_sku', 'ยังมี SKU ที่จับคู่ไม่ได้ ต้องจับคู่ให้ครบก่อนยืนยันนำเข้า', {
        unmatched: payload.unmatched.map((group) => group.platformSku),
      });
    }
    if (body.ignoreUnmatched) {
      // A half-matched order would deduct the matched lines and silently drop
      // the rest, so the whole order waits instead of moving partially.
      const hasUnmatched = (order: PreviewOrderPayload): boolean =>
        order.lines.some((line) => line.matchSource === 'unmatched');
      orders = orders.filter((order) => !hasUnmatched(order));
    }

    const now = ctx.clock.now();
    const warehouse = await inventoryRepo.getDefaultWarehouse(tx, { orgId });
    const warehouseId = asWarehouseId(warehouse.id);
    const componentsByBundle = await catalogRepo.getBundleComponentMap(tx, { orgId });

    // 3. Duplicate detection is per (channelId, externalOrderId) - the
    //    lifeline that keeps a re-import from deducting stock twice.
    const existingOrders = await orderRepo.listOrdersByExternalIds(tx, {
      orgId,
      channelId,
      externalIds: orders.map((order) => order.externalOrderId),
    });
    const existingByExternal = new Map(
      existingOrders.map((order) => [order.externalOrderId, order]),
    );

    let movementsCreated = 0;
    let ordersApplied = 0;
    let cogs = 0;

    for (const order of orders) {
      const existing = existingByExternal.get(order.externalOrderId);
      // What did the sale already do to stock? Without this history a cancel
      // in the file could not restore the ORIGINAL cost of the sale.
      const previousMovements = existing
        ? await movementRepo.listMovementsForOrder(tx, { orgId, orderId: existing.id })
        : [];
      const hadSaleOut = previousMovements.some((movement) => movement.reason === 'sale_out');
      const effect = resolveStockEffect(existing?.status, order.status, hadSaleOut);
      if (effect === 'invalid') {
        throw new StockHubError(
          'validation_error',
          `สถานะออเดอร์ ${order.externalOrderId} เปลี่ยนจาก ${existing?.status} เป็น ${order.status} ไม่ได้`,
          { externalOrderId: order.externalOrderId },
        );
      }

      // 3b. Upsert is idempotent on (channelId, externalOrderId): a repeated
      //     file refreshes the row and keeps the first import's audit trail.
      const savedOrder = await orderRepo.upsertOrder(tx, {
        orgId,
        channelId,
        externalOrderId: order.externalOrderId,
        status: order.status,
        orderedAt: new Date(order.orderedAt),
        shippedAt: order.shippedAt ? new Date(order.shippedAt) : null,
        cancelledAt: order.status === 'cancelled' || order.status === 'returned' ? now : null,
        buyerName: order.buyerName ?? null,
        grandTotal: order.grandTotal,
        importBatchId: batchId,
        raw: { source: 'import', importBatchId: batchId },
      });
      await orderRepo.replaceOrderLines(tx, {
        orderId: savedOrder.id,
        lines: order.lines.map((line) => ({
          orgId,
          orderId: savedOrder.id,
          variantId: line.variantId,
          platformSku: line.platformSku,
          platformProductName: line.platformProductName,
          variationName: line.variationName,
          qty: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          matchSource: line.matchSource,
        })),
      });
      ordersApplied += 1;
      if (effect === 'none') continue;

      if (effect === 'consume') {
        // 4. A bundle owns no stock: its lines expand into components first.
        const expanded = expandBundles(
          order.lines.flatMap((line) =>
            line.variantId ? [{ variantId: asVariantId(line.variantId), qty: line.quantity }] : [],
          ),
          componentsByBundle,
        );
        // 5. Lock every affected variant's open lots, one global order by
        //    variant id, so two concurrent batches queue instead of deadlock.
        const lotsByVariant = new Map<VariantId, readonly StockLot[]>();
        for (const variantId of [...new Set(expanded.map((line) => line.variantId))].sort()) {
          lotsByVariant.set(
            variantId,
            await inventoryRepo.getOpenLotsForUpdate(tx, { orgId, variantId, warehouseId }),
          );
        }
        // 6./7. The sale already happened in the real world, so a missing lot
        // is a reported shortfall, never a refused import.
        const planned = planMovements(
          {
            reason: 'sale_out',
            warehouseId,
            channelId,
            orderId: asOrderId(savedOrder.id),
            occurredAt: new Date(order.shippedAt ?? order.orderedAt),
            note: `นำเข้าไฟล์ ${batch.fileName}`,
            lines: expanded,
            shortagePolicy: 'shortfall',
          },
          { lotsByVariant },
        );
        const recorded = await movementRepo.recordMovements(tx, {
          orgId,
          planned,
          createdBy: ctx.auth.userId,
          orderId: savedOrder.id,
          channelId,
        });
        movementsCreated += recorded.length;
        cogs = satang(cogs + recorded.reduce((sum, movement) => sum + movement.costTotal, 0));
        continue;
      }

      // effect === 'restore': put back exactly what the sale took, at the
      // cost the sale consumed - never repriced at today's lot cost.
      const reason = order.status === 'returned' ? 'return_in' : 'cancel_restore';
      const { outstanding, slicesByVariant } = outstandingSales(previousMovements);
      const lines: MovementRequestLine[] = [];
      for (const [variantId, qty] of outstanding) {
        const restore = slicesByVariant.get(variantId) ?? [];
        if (qty <= 0 || restore.length === 0) continue;
        lines.push({ variantId, qty, restore });
      }
      const planned = planMovements(
        {
          reason,
          warehouseId,
          channelId,
          orderId: asOrderId(savedOrder.id),
          occurredAt: now,
          note: `ยกเลิก/คืนสินค้าจากไฟล์ ${batch.fileName}`,
          lines,
        },
        // Restores re-credit recorded slices, so no lots need locking to plan.
        { lotsByVariant: new Map() },
      );
      const recorded = await movementRepo.recordMovements(tx, {
        orgId,
        planned,
        createdBy: ctx.auth.userId,
        orderId: savedOrder.id,
        channelId,
      });
      movementsCreated += recorded.length;
      cogs = satang(cogs - recorded.reduce((sum, movement) => sum + movement.costTotal, 0));
    }

    // 8. Commit the lifecycle marker last; everything above rolled back if it threw.
    await importRepo.updateBatch(tx, batchId, { status: 'applied', appliedAt: now });

    return { movementsCreated, ordersApplied, cogs };
  });

/**
 * The stock answer for one order, using the same table the POS flow uses.
 *
 * A NEW order never consults stockEffectOf: the platform says the goods
 * already left (shipped/delivered), while confirmed and pending must not move
 * stock - stockEffectOf would call pending -> confirmed invalid, which is a
 * POS-transition answer, not an import answer.
 * For an EXISTING order the same-status case is a duplicate row in an
 * overlapping file: a no-op, not the error stockEffectOf returns.
 */
const resolveStockEffect = (
  existing: OrderStatus | undefined,
  fileStatus: OrderStatus,
  alreadyMoved: boolean,
): 'consume' | 'restore' | 'none' | 'invalid' => {
  if (!existing) {
    return fileStatus === 'shipped' || fileStatus === 'delivered' ? 'consume' : 'none';
  }
  if (existing === fileStatus) return 'none';
  return stockEffectOf(existing, fileStatus, alreadyMoved);
};

/**
 * Units still out with the buyer per variant, and the exact lot slices the
 * sale consumed. Restore movements reduce the outstanding count, so a cancel
 * imported after a partial return can never push a lot past its received qty.
 */
const outstandingSales = (
  movements: readonly movementRepo.OrderMovementRow[],
): {
  outstanding: Map<VariantId, number>;
  slicesByVariant: Map<VariantId, LotConsumption[]>;
} => {
  const outstanding = new Map<VariantId, number>();
  const slicesByVariant = new Map<VariantId, LotConsumption[]>();
  for (const movement of movements) {
    const variantId = asVariantId(movement.variantId);
    if (movement.reason === 'sale_out') {
      outstanding.set(variantId, (outstanding.get(variantId) ?? 0) - movement.qtyDelta);
      const slices = slicesByVariant.get(variantId) ?? [];
      slices.push(...movement.consumptions);
      slicesByVariant.set(variantId, slices);
    } else if (movement.reason === 'return_in' || movement.reason === 'cancel_restore') {
      outstanding.set(variantId, (outstanding.get(variantId) ?? 0) - movement.qtyDelta);
    }
  }
  return { outstanding, slicesByVariant };
};

/** List batches for the imports screen, newest first. */
export const listImports = async (ctx: ServiceContext): Promise<ImportBatch[]> => {
  const db = ctx.db();
  const orgId = ctx.auth.orgId;
  const rows = await importRepo.listBatches(db, { orgId, limit: 50 });
  return toBatchViews(db, orgId, rows);
};

/**
 * Resolve the display fields the wire batch carries but the row does not
 * store: channel name and kind, uploader display name, and the counters that
 * live inside the preview payload instead of columns.
 */
const toBatchViews = async (
  exec: DbExecutor,
  orgId: OrgId,
  rows: readonly ImportBatchRow[],
): Promise<ImportBatch[]> => {
  if (rows.length === 0) return [];
  const channels = await channelRepo.listChannels(exec, { orgId });
  const kindByChannel = new Map(channels.map((channel) => [channel.id, channel.kind]));
  const nameByChannel = new Map(channels.map((channel) => [channel.id, channel.name]));

  const uploaderIds = [...new Set(rows.flatMap((row) => (row.uploadedBy ? [row.uploadedBy] : [])))];
  const uploaders = uploaderIds.length
    ? await exec
        .select({ id: schema.users.id, fullName: schema.users.fullName })
        .from(schema.users)
        .where(inArray(schema.users.id, uploaderIds))
    : [];
  const nameByUploader = new Map(uploaders.map((user) => [user.id, user.fullName]));

  return rows.map((row) => ({
    id: row.id,
    orgId: row.orgId,
    channelId: row.channelId,
    channelName: row.channelId ? nameByChannel.get(row.channelId) : undefined,
    channelKind: row.channelId ? (kindByChannel.get(row.channelId) ?? null) : null,
    fileName: row.fileName,
    fileSize: row.fileSize,
    objectKey: row.r2ObjectKey,
    status: row.status,
    detectedKind: row.detectedKind,
    rowsRead: row.rowsRead,
    ordersParsed: row.ordersParsed,
    linesParsed: row.preview?.linesParsed ?? 0,
    unmatchedCount: row.preview?.unmatched.length ?? 0,
    issueCount: row.issues.length,
    uploadedAt: row.createdAt.toISOString(),
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    uploadedBy: row.uploadedBy ?? undefined,
    uploadedByName: row.uploadedBy ? nameByUploader.get(row.uploadedBy) : undefined,
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
  }));
};
