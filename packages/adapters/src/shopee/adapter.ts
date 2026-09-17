/**
 * Shopee order-export adapter.
 *
 * ARCHITECTURE NOTE - read this before changing anything.
 *   This class implements `OrderSourceAdapter` from @stockhub/core. That is the
 *   ONLY thing the rest of the system knows about it. It does not touch the
 *   database, R2, or HTTP, and it does not decide stock movements - it turns
 *   bytes into `NormalizedOrder[]` and reports problems as `ParseIssue[]`.
 *
 *   "Read files today, call APIs tomorrow": when Shopee OpenAPI access is
 *   granted, add `src/shopee/api-adapter.ts` implementing the same interface
 *   (detect() -> confidence 0, because there is no file to sniff; parse() ->
 *   fetch orders and map them into the same NormalizedOrder shape), register it
 *   instead of this one, and NOTHING in packages/core, packages/db, apps/api or
 *   apps/web changes. That is the whole point of the port.
 *
 * FAILURE POLICY
 *   Never throw on a bad row. One broken line in a 2,000 line export must not
 *   kill the import. Push a ParseIssue and carry on. The only thing that may
 *   throw is a file that is not a Shopee export at all.
 *
 * SHOPEE SPECIFICS
 *   - CSV exports carry a UTF-8 BOM; shared/read-tabular.ts strips it.
 *   - One row per order line, with the order header repeated on every row.
 *   - A cancelled or returned order still appears with its normal status in one
 *     column and the cancellation state in another ("สถานะการยกเลิก/คืนเงิน"),
 *     so read status-map.ts before trusting a single column.
 */

import {
  type DetectionResult,
  type NormalizedOrder,
  NotImplementedError,
  type OrderSourceAdapter,
  type OrderStatus,
  type ParseContext,
  type ParseIssue,
  type ParseResult,
  type RawImportFile,
  type Satang,
} from '@stockhub/core';
import { groupRowsByOrder } from '../shared/group-rows';
import { buildHeaderIndex, cell, resolveColumns, scoreSignature } from '../shared/header-match';
import { parseDate, parseMoney } from '../shared/parse-values';
import { looksLikeMojibake, readHeaders, readTabular } from '../shared/read-tabular';
import { SHOPEE_COLUMNS, SHOPEE_SIGNATURE, type ShopeeColumn } from './columns';
import { mapShopeeStatus } from './status-map';

/**
 * Columns without which the file is unusable. Everything else is optional.
 * A Shopee export always carries all four.
 */
const REQUIRED_COLUMNS: readonly ShopeeColumn[] = [
  'externalOrderId',
  'orderStatus',
  'platformSku',
  'quantity',
];

/** Options for shared/read-tabular.ts. Shopee puts the header on the first row. */
const READ_OPTIONS = { headerRow: 0, skipRowsAfterHeader: 0 } as const;

/** 1-based source row number of the first data row. Used for ParseIssue.row. */
const FIRST_DATA_ROW = 2;

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

export class ShopeeOrderAdapter implements OrderSourceAdapter {
  readonly kind = 'shopee' as const;
  readonly displayName = 'Shopee';
  readonly sourceHint =
    'Seller Centre > คำสั่งซื้อของฉัน > ส่งออก (Export) > เลือกช่วงวันที่ แล้วอัปโหลดไฟล์ .csv หรือ .xlsx ที่ได้';

  /**
   * Header sniffing only - IMPLEMENTED, not a stub.
   *
   * Reads just the header row (see readHeaders) and scores it against
   * SHOPEE_SIGNATURE from columns.ts. Cost is one header line, so the registry can
   * safely run this on every adapter for every upload.
   */
  async detect(file: RawImportFile): Promise<DetectionResult> {
    try {
      const index = buildHeaderIndex(readHeaders(file, { headerRow: READ_OPTIONS.headerRow }));
      const score = scoreSignature(index, SHOPEE_SIGNATURE);
      const fingerprint = score.matchedUnique[0];
      const reason =
        fingerprint === undefined
          ? `matched ${score.requiredMatched}/${score.requiredTotal} expected Shopee columns`
          : `found Shopee header "${fingerprint}"`;
      return { kind: this.kind, confidence: score.confidence, reason };
    } catch (error) {
      // An unreadable file is not this adapter's problem - it is simply not ours.
      return {
        kind: this.kind,
        confidence: 0,
        reason: `unreadable as a Shopee export: ${(error as Error).message}`,
      };
    }
  }

  /**
   * SKELETON. The plumbing below is real; the line mapping is the TODO block.
   *
   * Pipeline:
   *   1. read the sheet            -> shared/read-tabular.ts   (done)
   *   2. resolve columns           -> shared/header-match.ts   (done)
   *   3. group rows into orders    -> shared/group-rows.ts     (done)
   *   4. parse order-level fields  -> below                    (done)
   *   5. map each row to a line    -> TODO BLOCK 1
   *   6. assemble NormalizedOrder  -> TODO BLOCK 2
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
    const { columns, missing } = resolveColumns(buildHeaderIndex(table.headers), SHOPEE_COLUMNS);
    for (const key of missing) {
      issues.push({
        severity: REQUIRED_COLUMNS.includes(key) ? 'error' : 'warning',
        column: key,
        code: 'missing_column',
        message: `Column "${key}" was not found in the Shopee export. Add the new header to src/shopee/columns.ts.`,
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
      const status = mapShopeeStatus(rawStatus);
      if (status === undefined) {
        issues.push({
          severity: 'error',
          row,
          column: 'orderStatus',
          code: 'unknown_status',
          message: `Unknown Shopee status "${rawStatus ?? ''}". Add it to src/shopee/status-map.ts. The order was skipped so that stock is never moved on a guess.`,
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

    /* =====================================================================
     * TODO BLOCK 1 - map each row of a draft to a NormalizedOrderLine.
     * For every draft, for every `draft.rows[i]` (row number
     * `draft.rowNumbers[i]`):
     *   1. platformSku = cell(row, columns.platformSku)
     *      -> if undefined: push { severity:'error', code:'missing_sku' } and
     *         skip the LINE, not the whole order.
     *   2. quantity = parseQty(cell(row, columns.quantity))
     *      -> if undefined or 0: push 'bad_quantity' and skip the line.
     *   3. unitPrice = parseMoney(cell(row, columns.unitPrice)) ?? ZERO
     *      -> ZERO is legitimate for a free gift line; warn, do not fail.
     *   4. discount = parseMoney(cell(row, columns.sellerDiscount)) ?? ZERO
     *      -> SELLER-FUNDED ONLY. Platform subsidy is revenue, not a discount,
     *         and must not reduce the recorded sale value.
     *   5. platformProductName = cell(row, columns.productName) ?? platformSku
     *   6. variationName = cell(row, columns.variationName)
     *   7. push { platformSku, platformProductName, variationName, quantity,
     *              unitPrice, discount }
     *   7b. SHOPEE ONLY: if `cancellationStatus` says the line was refunded while
     *       the order status still reads as completed, prefer the cancelled /
     *       returned status. Shopee reports these in two separate columns.
     * =====================================================================
     *
     * TODO BLOCK 2 - assemble the order.
     *   8.  if lines.length === 0: push 'empty_order' and skip the order.
     *   9.  computed = sum(unitPrice * quantity - discount) over lines.
     *   10. if draft.grandTotal is present and differs from `computed` by more
     *       than 1 satang, push a 'total_mismatch' WARNING carrying both
     *       numbers. Do not reject - shipping fees and platform vouchers make
     *       small differences normal, but a large one means the column map is
     *       wrong and support needs to see it.
     *   11. orders.push({
     *         externalOrderId: draft.externalOrderId,
     *         channelKind: 'shopee',
     *         status: draft.status,
     *         orderedAt: draft.orderedAt,
     *         shippedAt: draft.shippedAt,
     *         buyerName: draft.buyerName,
     *         grandTotal: draft.grandTotal ?? computed,
     *         lines,
     *         raw: { rows: draft.rows },   // verbatim, for support
     *       });
     *   12. Delete the `throw` below.
     * ===================================================================== */
    if (drafts.length > 0) {
      throw new NotImplementedError(
        `ShopeeOrderAdapter.parse line mapping (${drafts.length} orders / ${table.rows.length} rows were recognised)`,
      );
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

export const shopeeAdapter = new ShopeeOrderAdapter();
