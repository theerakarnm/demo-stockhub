/**
 * Lazada order-export adapter.
 *
 * ARCHITECTURE NOTE - read this before changing anything.
 *   This class implements `OrderSourceAdapter` from @stockhub/core. That is the
 *   ONLY thing the rest of the system knows about it. It does not touch the
 *   database, R2, or HTTP, and it does not decide stock movements - it turns
 *   bytes into `NormalizedOrder[]` and reports problems as `ParseIssue[]`.
 *
 *   "Read files today, call APIs tomorrow": when Lazada OpenAPI access is
 *   granted, add `src/lazada/api-adapter.ts` implementing the same interface
 *   (detect() -> confidence 0, because there is no file to sniff; parse() ->
 *   fetch orders and map them into the same NormalizedOrder shape), register it
 *   instead of this one, and NOTHING in packages/core, packages/db, apps/api or
 *   apps/web changes. That is the whole point of the port.
 *
 * FAILURE POLICY
 *   Never throw on a bad row. One broken line in a 2,000 line export must not
 *   kill the import. Push a ParseIssue and carry on. The only thing that may
 *   throw is a file that is not a Lazada export at all.
 *
 * LAZADA SPECIFICS
 *   - ONE ROW PER UNIT, not per line. An order of 3 identical hoes is 3 rows,
 *     each with its own `orderItemId` and no quantity column. TODO BLOCK 1
 *     therefore has to collapse rows by (order, sellerSku) and count them
 *     instead of reading a quantity cell. Getting this wrong under-deducts
 *     stock by a factor of the quantity, so it is the single most important
 *     thing to verify against a real Lazada export.
 *   - `unitPrice` is the list price and `paidPrice` is what the buyer actually
 *     paid. The recorded line price is the `unitPrice` column and the discount
 *     is `sellerDiscountTotal` - adapter.test.ts pins both, so paidPrice stays
 *     informational only.
 *   - Headers are camelCase; header-match.ts already lowercases them.
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
import { parseDate, parseMoney, parseQty } from '../shared/parse-values';
import { looksLikeMojibake, readHeaders, readTabular } from '../shared/read-tabular';
import { LAZADA_COLUMNS, LAZADA_SIGNATURE, type LazadaColumn } from './columns';
import { mapLazadaStatus } from './status-map';

/**
 * Columns without which the file is unusable. Everything else is optional.
 * NOTE: `quantity` is deliberately NOT required - see the per-unit row note
 * above. When the column is absent the adapter treats every row as one unit.
 */
const REQUIRED_COLUMNS: readonly LazadaColumn[] = ['externalOrderId', 'orderStatus', 'platformSku'];

/** Options for shared/read-tabular.ts. Lazada puts the header on the first row. */
const READ_OPTIONS = { headerRow: 0, skipRowsAfterHeader: 0 } as const;

/** 1-based source row number of the first data row. Used for ParseIssue.row. */
const FIRST_DATA_ROW = 2;

/**
 * Synthetic quantity header. Collapsed per-unit totals are written to the row
 * copy under this key and handed to mapLine as `columns.quantity`, so the
 * shared mapper never learns about Lazada's one-row-per-unit layout.
 */
const QTY_KEY = '__qty';

/**
 * Order-level fields, parsed for real from the first row of each order group.
 * Line mapping happens in the parse loop via shared/map-lines.ts.
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

export class LazadaOrderAdapter implements OrderSourceAdapter {
  readonly kind = 'lazada' as const;
  readonly displayName = 'Lazada';
  readonly sourceHint = 'Seller Center > Orders > Manage Orders > Export แล้วอัปโหลดไฟล์ .csv ที่ได้';

  /**
   * Header sniffing only - IMPLEMENTED, not a stub.
   *
   * Reads just the header row (see readHeaders) and scores it against
   * LAZADA_SIGNATURE from columns.ts. Cost is one header line, so the registry can
   * safely run this on every adapter for every upload.
   */
  async detect(file: RawImportFile): Promise<DetectionResult> {
    try {
      const index = buildHeaderIndex(readHeaders(file, { headerRow: READ_OPTIONS.headerRow }));
      const score = scoreSignature(index, LAZADA_SIGNATURE);
      const fingerprint = score.matchedUnique[0];
      const reason =
        fingerprint === undefined
          ? `matched ${score.requiredMatched}/${score.requiredTotal} expected Lazada columns`
          : `found Lazada header "${fingerprint}"`;
      return { kind: this.kind, confidence: score.confidence, reason };
    } catch (error) {
      // An unreadable file is not this adapter's problem - it is simply not ours.
      return {
        kind: this.kind,
        confidence: 0,
        reason: `unreadable as a Lazada export: ${(error as Error).message}`,
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
   *   5. collapse per-unit rows    -> below (Lazada only)
   *   6. map each row to a line    -> shared/map-lines.ts (mapLine)
   *   7. assemble NormalizedOrder  -> shared/map-lines.ts (assembleOrder)
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
    const { columns, missing } = resolveColumns(buildHeaderIndex(table.headers), LAZADA_COLUMNS);
    for (const key of missing) {
      issues.push({
        severity: REQUIRED_COLUMNS.includes(key) ? 'error' : 'warning',
        column: key,
        code: 'missing_column',
        message: `Column "${key}" was not found in the Lazada export. Add the new header to src/lazada/columns.ts.`,
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
      const status = mapLazadaStatus(rawStatus);
      if (status === undefined) {
        issues.push({
          severity: 'error',
          row,
          column: 'orderStatus',
          code: 'unknown_status',
          message: `Unknown Lazada status "${rawStatus ?? ''}". Add it to src/lazada/status-map.ts. The order was skipped so that stock is never moved on a guess.`,
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

    // --- 5. collapse per-unit rows (LAZADA ONLY) ---------------------------
    // One row is one unit, so rows sharing a seller SKU fold into ONE line:
    // keep the first row's cells (its orderItemId becomes the externalLineId)
    // and sum the units - a parsed quantity cell wins, any other row counts 1.
    // A missing SKU forms its own group, so mapLine still reports it per line.
    for (const draft of drafts) {
      const collapsed = new Map<
        string,
        { row: Record<string, string>; rowNumber: number; units: number }
      >();
      draft.rows.forEach((row, i) => {
        const key = cell(row, columns.platformSku) ?? '';
        const units = parseQty(cell(row, columns.quantity)) ?? 1;
        const existing = collapsed.get(key);
        if (existing) {
          existing.units += units;
          return;
        }
        collapsed.set(key, { row, rowNumber: draft.rowNumbers[i] ?? FIRST_DATA_ROW, units });
      });

      // --- 6/7. map the collapsed rows to lines, then assemble the order ---
      // Line mapping and assembly are shared with Shopee and TikTok
      // (shared/map-lines.ts). The collapsed total reaches the mapper through
      // a synthetic quantity cell on a row copy, so the mapper never learns
      // about per-unit rows.
      const lines: NormalizedOrderLine[] = [];
      for (const { row, rowNumber, units } of collapsed.values()) {
        const line = mapLine(
          { ...row, [QTY_KEY]: String(units) },
          rowNumber,
          { ...columns, quantity: QTY_KEY },
          issues,
        );
        if (line) lines.push(line);
      }

      const order = assembleOrder(draft, lines, 'lazada', issues);
      if (order) orders.push(order);
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

export const lazadaAdapter = new LazadaOrderAdapter();
