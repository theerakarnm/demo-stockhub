/**
 * TikTok Shop order-export adapter.
 *
 * ARCHITECTURE NOTE - read this before changing anything.
 *   This class implements `OrderSourceAdapter` from @stockhub/core. That is the
 *   ONLY thing the rest of the system knows about it. It does not touch the
 *   database, R2, or HTTP, and it does not decide stock movements - it turns
 *   bytes into `NormalizedOrder[]` and reports problems as `ParseIssue[]`.
 *
 *   "Read files today, call APIs tomorrow": when TikTok Shop OpenAPI access is
 *   granted, add `src/tiktok/api-adapter.ts` implementing the same interface
 *   (detect() -> confidence 0, because there is no file to sniff; parse() ->
 *   fetch orders and map them into the same NormalizedOrder shape), register it
 *   instead of this one, and NOTHING in packages/core, packages/db, apps/api or
 *   apps/web changes. That is the whole point of the port.
 *
 * FAILURE POLICY
 *   Never throw on a bad row. One broken line in a 2,000 line export must not
 *   kill the import. Push a ParseIssue and carry on. The only thing that may
 *   throw is a file that is not a TikTok Shop export at all.
 *
 * TIKTOK SPECIFICS
 *   - The export has TWO header-ish rows: the real header, then a description
 *     row ("The unique ID of the order", ...). READ_OPTIONS skips it, which is
 *     why FIRST_DATA_ROW is 3 and not 2.
 *   - State lives in two columns: "Order Status" + "Order Substatus".
 *   - Money columns are per SKU and prefixed "SKU ", e.g.
 *     "SKU Subtotal After Discount".
 *   - Order ids are 19 digit numbers. Excel happily turns them into
 *     5.77e+18, so always read them as text - read-tabular.ts asks SheetJS for
 *     the formatted string, but a seller who re-saved the file in Excel may
 *     already have destroyed the id. Warn about it in the preview screen.
 */

import type {
  DetectionResult,
  NormalizedOrder,
  NormalizedOrderLine,
  OrderSourceAdapter,
  OrderStatus,
  ParseContext,
  ParseIssue,
  ParseResult,
  RawImportFile,
  Satang,
} from '@stockhub/core';
import { groupRowsByOrder } from '../shared/group-rows';
import { buildHeaderIndex, cell, resolveColumns, scoreSignature } from '../shared/header-match';
import { assembleOrder, mapLine } from '../shared/map-lines';
import { parseDate, parseMoney } from '../shared/parse-values';
import { looksLikeMojibake, readHeaders, readTabular } from '../shared/read-tabular';
import { TIKTOK_COLUMNS, TIKTOK_SIGNATURE, type TiktokColumn } from './columns';
import { mapTiktokStatus } from './status-map';

/**
 * Columns without which the file is unusable. Everything else is optional.
 * A TikTok export always carries all four.
 */
const REQUIRED_COLUMNS: readonly TiktokColumn[] = [
  'externalOrderId',
  'orderStatus',
  'platformSku',
  'quantity',
];

/** Options for shared/read-tabular.ts. TikTok puts a description row directly under the header row, so one data row is skipped. */
const READ_OPTIONS = { headerRow: 0, skipRowsAfterHeader: 1 } as const;

/** 1-based source row number of the first data row. Used for ParseIssue.row. */
const FIRST_DATA_ROW = 3;

/**
 * Order-level fields, parsed for real from the first row of each order group.
 * The remaining work (mapping the lines) is the TODO block in `parse()`.
 */
interface OrderHeaderDraft {
  externalOrderId: string;
  status: OrderStatus;
  orderedAt: Date;
  shippedAt?: Date;
  buyerName?: string;
  grandTotal?: Satang;
  rows: Record<string, string>[];
  rowNumbers: number[];
}

export class TiktokOrderAdapter implements OrderSourceAdapter {
  readonly kind = 'tiktok' as const;
  readonly displayName = 'TikTok Shop';
  readonly sourceHint =
    'TikTok Shop Seller Center > Orders > All Orders > Export แล้วอัปโหลดไฟล์ .xlsx หรือ .csv ที่ได้';

  /**
   * Header sniffing only - IMPLEMENTED, not a stub.
   *
   * Reads just the header row (see readHeaders) and scores it against
   * TIKTOK_SIGNATURE from columns.ts. Cost is one header line, so the registry can
   * safely run this on every adapter for every upload.
   */
  async detect(file: RawImportFile): Promise<DetectionResult> {
    try {
      const index = buildHeaderIndex(readHeaders(file, { headerRow: READ_OPTIONS.headerRow }));
      const score = scoreSignature(index, TIKTOK_SIGNATURE);
      const fingerprint = score.matchedUnique[0];
      const reason =
        fingerprint === undefined
          ? `matched ${score.requiredMatched}/${score.requiredTotal} expected TikTok Shop columns`
          : `found TikTok Shop header "${fingerprint}"`;
      return { kind: this.kind, confidence: score.confidence, reason };
    } catch (error) {
      // An unreadable file is not this adapter's problem - it is simply not ours.
      return {
        kind: this.kind,
        confidence: 0,
        reason: `unreadable as a TikTok Shop export: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fully implemented: every stage of the pipeline below runs for real.
   *
   * Pipeline:
   *   1. read the sheet            -> shared/read-tabular.ts
   *   2. resolve columns           -> shared/header-match.ts
   *   3. group rows into orders    -> shared/group-rows.ts
   *   4. parse order-level fields  -> below
   *   5. map each row to a line    -> shared/map-lines.ts (mapLine)
   *   6. assemble NormalizedOrder  -> shared/map-lines.ts (assembleOrder)
   */
  async parse(file: RawImportFile, ctx: ParseContext): Promise<ParseResult> {
    const issues: ParseIssue[] = [];
    const table = readTabular(file, READ_OPTIONS);

    if (table.headers.some((header) => looksLikeMojibake(header))) {
      issues.push({
        severity: 'warning',
        code: 'encoding_suspect',
        message:
          'ตัวอักษรไทยในไฟล์อาจเสีย กรุณาบันทึกไฟล์เป็น CSV UTF-8 แล้วอัปโหลดใหม่ ' +
          '(header text decoded to replacement characters - the file is probably TIS-620)',
      });
    }

    // --- 2. resolve columns -------------------------------------------------
    const { columns, missing } = resolveColumns(buildHeaderIndex(table.headers), TIKTOK_COLUMNS);
    for (const key of missing) {
      issues.push({
        severity: REQUIRED_COLUMNS.includes(key) ? 'error' : 'warning',
        column: key,
        code: 'missing_column',
        message: `Column "${key}" was not found in the TikTok Shop export. Add the new header to src/tiktok/columns.ts.`,
      });
    }
    const hasAllRequired = REQUIRED_COLUMNS.every((key) => columns[key] !== undefined);
    if (!hasAllRequired) {
      return {
        orders: [],
        issues,
        stats: {
          rowsRead: table.rows.length,
          ordersParsed: 0,
          linesParsed: 0,
          rowsSkipped: table.rows.length,
        },
      };
    }

    // --- 3. group rows into orders -----------------------------------------
    const { groups, rowsWithoutKey } = groupRowsByOrder(
      table.rows,
      (row) => cell(row, columns.externalOrderId),
      FIRST_DATA_ROW,
    );
    for (const row of rowsWithoutKey) {
      issues.push({
        severity: 'warning',
        row,
        code: 'missing_order_id',
        message: 'Row has no order id and was skipped.',
      });
    }

    // --- 4. order-level fields (real) --------------------------------------
    const drafts: OrderHeaderDraft[] = [];
    for (const group of groups) {
      const head = group.rows[0];
      const row = group.rowNumbers[0];
      if (head === undefined) continue;

      const rawStatus = cell(head, columns.orderStatus);
      const status = mapTiktokStatus(rawStatus);
      if (status === undefined) {
        issues.push({
          severity: 'error',
          row,
          column: 'orderStatus',
          code: 'unknown_status',
          message: `Unknown TikTok Shop status "${rawStatus ?? ''}". Add it to src/tiktok/status-map.ts. The order was skipped so that stock is never moved on a guess.`,
        });
        continue;
      }

      const orderedAt = parseDate(cell(head, columns.orderedAt), ctx.timeZone);
      if (orderedAt === undefined) {
        issues.push({
          severity: 'error',
          row,
          column: 'orderedAt',
          code: 'bad_date',
          message: `Could not read the order date "${cell(head, columns.orderedAt) ?? ''}".`,
        });
        continue;
      }

      drafts.push({
        externalOrderId: group.key,
        status,
        orderedAt,
        shippedAt: parseDate(cell(head, columns.shippedAt), ctx.timeZone),
        buyerName: cell(head, columns.buyerName),
        grandTotal: parseMoney(cell(head, columns.grandTotal)),
        rows: group.rows,
        rowNumbers: group.rowNumbers,
      });
    }

    ctx.onProgress?.(table.rows.length);

    const orders: NormalizedOrder[] = [];

    // --- 5/6. map each row to a line, then assemble the order --------------
    // Line mapping and assembly are shared with Shopee and Lazada
    // (shared/map-lines.ts). What stays here is the TikTok substatus override:
    // a substatus mapping to cancelled or returned wins over the main status,
    // because a "Cancelled" order whose substatus says it was cancelled before
    // handover never moved stock, so no cancel_restore movement may be
    // produced later.
    for (const draft of drafts) {
      const lines: NormalizedOrderLine[] = [];
      draft.rows.forEach((row, i) => {
        const line = mapLine(row, draft.rowNumbers[i] ?? FIRST_DATA_ROW, columns, issues);
        if (line) lines.push(line);
      });
      const substatus = cell(draft.rows[0] ?? {}, columns.orderSubStatus);
      const override = mapTiktokStatus(substatus);
      const status = override === 'cancelled' || override === 'returned' ? override : draft.status;
      const order = assembleOrder({ ...draft, status }, lines, 'tiktok', issues);
      if (order) {
        // raw keeps the substatus next to the verbatim rows so support can see
        // why an order ended up cancelled or returned.
        order.raw = { rows: draft.rows, substatus };
        orders.push(order);
      }
    }

    const linesParsed = orders.reduce((sum, order) => sum + order.lines.length, 0);
    return {
      orders,
      issues,
      stats: {
        rowsRead: table.rows.length,
        ordersParsed: orders.length,
        linesParsed,
        rowsSkipped: table.rows.length - linesParsed,
      },
    };
  }
}

export const tiktokAdapter = new TiktokOrderAdapter();
