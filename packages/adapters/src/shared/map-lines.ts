/**
 * Shared order-line mapping and order assembly.
 *
 * TODO BLOCK 1 and TODO BLOCK 2 describe the same steps in every adapter:
 * turn one row into a NormalizedOrderLine, then turn a draft + its lines into
 * a NormalizedOrder. That logic is platform-agnostic (platform-specific status
 * overrides are applied by the caller BEFORE assembleOrder), so it lives here
 * once instead of being copy-pasted into three adapters.
 *
 * FAILURE POLICY (AGENTS.md rule 2): a bad row never throws. mapLine pushes a
 * ParseIssue and returns undefined for that LINE only; the rest of the order
 * and the rest of the file keep importing.
 */

import {
  type ImportableChannelKind,
  type NormalizedOrder,
  type NormalizedOrderLine,
  type OrderStatus,
  type ParseIssue,
  type Satang,
  ZERO,
  addMoney,
  mulMoney,
  satang,
  subMoney,
} from '@stockhub/core';
import { cell } from './header-match';
import { parseMoney, parseQty } from './parse-values';

/**
 * Verbatim headers of the columns mapLine reads. Every field is optional:
 * a missing column degrades to a ParseIssue, never to a crash, so a seller
 * who deselects columns in the export dialog still gets a usable import.
 */
export interface LineColumns {
  platformSku?: string;
  quantity?: string;
  unitPrice?: string;
  sellerDiscount?: string;
  productName?: string;
  variationName?: string;
  externalLineId?: string;
}

/**
 * An order header as the adapter's parse loop holds it after grouping:
 * order-level fields from the first row, plus every raw row of the group.
 */
export interface OrderDraft {
  externalOrderId: string;
  status: OrderStatus;
  orderedAt: Date;
  shippedAt?: Date;
  buyerName?: string;
  grandTotal?: Satang;
  rows: Record<string, string>[];
  rowNumbers: number[];
}

/**
 * Grand-total sanity check tolerance. Below 1 satang the difference is
 * rounding; above it the column map is probably wrong and support must see it.
 */
const TOTAL_MISMATCH_TOLERANCE = satang(1);

/**
 * TODO BLOCK 1 steps 1-7: one raw row -> one NormalizedOrderLine.
 *
 * Returns undefined (after pushing a ParseIssue) when the line must be
 * skipped: no SKU, or a quantity that is not a whole number above zero.
 */
export const mapLine = (
  row: Record<string, string>,
  rowNumber: number,
  columns: LineColumns,
  issues: ParseIssue[],
): NormalizedOrderLine | undefined => {
  // 1. Without a SKU the line has no identity for later stock matching, so it
  //    cannot be imported at all. Skip the LINE, not the whole order.
  const platformSku = cell(row, columns.platformSku);
  if (platformSku === undefined) {
    issues.push({
      severity: 'error',
      row: rowNumber,
      column: columns.platformSku,
      code: 'missing_sku',
      message: `Row ${rowNumber} has no SKU and was skipped.`,
    });
    return undefined;
  }

  // 2. A fractional, negative or unreadable quantity would deduct the wrong
  //    amount of stock, so the line is skipped instead of guessed.
  const quantity = parseQty(cell(row, columns.quantity));
  if (quantity === undefined || quantity === 0) {
    issues.push({
      severity: 'error',
      row: rowNumber,
      column: columns.quantity,
      code: 'bad_quantity',
      message: `Row ${rowNumber} has an unreadable quantity "${cell(row, columns.quantity) ?? ''}" and was skipped.`,
    });
    return undefined;
  }

  // 3. A missing or unreadable price becomes ZERO. Zero is legitimate for a
  //    free gift line, so it only warns - and only when the cell actually
  //    said 0, not when the column was absent.
  const unitPrice = parseMoney(cell(row, columns.unitPrice)) ?? ZERO;
  if (unitPrice === ZERO && cell(row, columns.unitPrice) !== undefined) {
    issues.push({
      severity: 'warning',
      row: rowNumber,
      column: columns.unitPrice,
      code: 'free_line',
      message: `Row ${rowNumber} has a price of 0 and was imported as a free line.`,
    });
  }

  // 4. Seller-funded discount ONLY. A platform subsidy is revenue, not a
  //    discount, and must never reduce the recorded sale value.
  const discount = parseMoney(cell(row, columns.sellerDiscount)) ?? ZERO;

  return {
    // Line id when the export carries one (Lazada orderItemId), else undefined.
    externalLineId: cell(row, columns.externalLineId),
    platformSku,
    // 5. A missing product name falls back to the SKU so support always has
    //    something human-readable to match against.
    platformProductName: cell(row, columns.productName) ?? platformSku,
    // 6. Variation stays undefined when the column is absent or empty.
    variationName: cell(row, columns.variationName),
    quantity,
    unitPrice,
    discount,
  };
};

/**
 * TODO BLOCK 2 steps 8-11: draft + lines -> NormalizedOrder.
 *
 * Returns undefined only for the empty-order case. A grand-total mismatch is
 * a warning, not a rejection: shipping fees and platform vouchers make small
 * differences normal, and the reported total is kept when present.
 */
export const assembleOrder = (
  draft: OrderDraft,
  lines: NormalizedOrderLine[],
  channelKind: ImportableChannelKind,
  issues: ParseIssue[],
): NormalizedOrder | undefined => {
  // 8. An order with no usable line cannot move stock or be matched later.
  if (lines.length === 0) {
    issues.push({
      severity: 'error',
      row: draft.rowNumbers[0],
      code: 'empty_order',
      message: `Order ${draft.externalOrderId} has no usable lines and was skipped.`,
    });
    return undefined;
  }

  // 9. Computed total from the lines themselves, never trusted from the file.
  let computed = ZERO;
  for (const line of lines) {
    computed = addMoney(computed, subMoney(mulMoney(line.unitPrice, line.quantity), line.discount));
  }

  // 10. Sanity-check against the platform's own grand total. Do not reject:
  //     the warning carries both numbers so support can judge the column map.
  if (
    draft.grandTotal !== undefined &&
    Math.abs(draft.grandTotal - computed) > TOTAL_MISMATCH_TOLERANCE
  ) {
    issues.push({
      severity: 'warning',
      row: draft.rowNumbers[0],
      code: 'total_mismatch',
      message: `Order ${draft.externalOrderId}: reported total ${draft.grandTotal} satang differs from the computed ${computed} satang by more than the ${TOTAL_MISMATCH_TOLERANCE} satang tolerance.`,
    });
  }

  // 11. `raw` keeps the rows verbatim so support can answer "why did it do that".
  return {
    externalOrderId: draft.externalOrderId,
    channelKind,
    status: draft.status,
    orderedAt: draft.orderedAt,
    shippedAt: draft.shippedAt,
    buyerName: draft.buyerName,
    grandTotal: draft.grandTotal ?? computed,
    lines,
    raw: { rows: draft.rows },
  };
};
