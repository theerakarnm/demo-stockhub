/**
 * Large-file smoke test.
 *
 * A realistic daily export is a few thousand rows, so this parses a 5,000-row
 * Shopee file built in memory and checks the pipeline both stays correct
 * (one bad line out of 5,000) and stays fast enough to feel interactive. The
 * time bound is deliberately generous: this is a smoke check, not a benchmark
 * - the real Workers CPU-budget check is the staging probe in the plan's
 * End-to-end verification.
 */

import { describe, expect, test } from 'bun:test';
import type { RawImportFile } from '@stockhub/core';
import { DEFAULT_TIME_ZONE } from './shared/parse-values';
import { shopeeAdapter } from './shopee/adapter';
import { SHOPEE_COLUMNS } from './shopee/columns';

const ctx = { timeZone: DEFAULT_TIME_ZONE };

const ORDER_COUNT = 2_500;
const LINES_PER_ORDER = 2;
/** 1-based data row that carries the unreadable quantity "abc". */
const BAD_DATA_ROW = 1_234;
/** Generous smoke bound in ms, not a benchmark - see the file comment. */
const MS_BUDGET = 5_000;

/** Column keys of the generated file, in file order. */
const COLUMN_ORDER = [
  'orderId',
  'orderStatus',
  'orderedAt',
  'platformSku',
  'productName',
  'quantity',
  'unitPrice',
  'grandTotal',
  'buyerName',
] as const;

type ColumnKey = (typeof COLUMN_ORDER)[number];

/** Thai headers, taken from the Shopee column map like a real TH export. */
const THAI_HEADERS: Record<ColumnKey, string> = {
  orderId: SHOPEE_COLUMNS.externalOrderId[0],
  orderStatus: SHOPEE_COLUMNS.orderStatus[0],
  orderedAt: SHOPEE_COLUMNS.orderedAt[0],
  platformSku: SHOPEE_COLUMNS.platformSku[0],
  productName: SHOPEE_COLUMNS.productName[0],
  quantity: SHOPEE_COLUMNS.quantity[0],
  unitPrice: SHOPEE_COLUMNS.unitPrice[0],
  grandTotal: SHOPEE_COLUMNS.grandTotal[0],
  buyerName: SHOPEE_COLUMNS.buyerName[0],
};

/**
 * Builds "2,500 orders x 2 lines" rows of CSV. Every line costs 259.00 with
 * quantity 1 or 2, so a healthy order totals 777.00; exactly one row gets a
 * quantity of "abc" and must be skipped as a ParseIssue, not crash the parse.
 */
const buildLargeCsv = (): string => {
  const csv: string[] = [COLUMN_ORDER.map((key) => THAI_HEADERS[key]).join(',')];
  for (let i = 1; i <= ORDER_COUNT; i++) {
    const orderSeq = String(i).padStart(6, '0');
    for (const line of [1, 2]) {
      const dataRow = (i - 1) * LINES_PER_ORDER + line;
      const badQuantity = dataRow === BAD_DATA_ROW;
      csv.push(
        [
          `260214LARGE${orderSeq}`,
          'ที่ต้องจัดส่ง',
          '2026-02-14 09:12:33',
          `SKU-${orderSeq}-${line}`,
          `สินค้าทดสอบ ${orderSeq} ชิ้นที่ ${line}`,
          badQuantity ? 'abc' : String(line),
          '259.00',
          '777.00',
          `buyer_${orderSeq}`,
        ].join(','),
      );
    }
  }
  return csv.join('\n');
};

describe('large-file parse', () => {
  test('parses 5,000 rows, reports the one bad row, and stays within the smoke budget', async () => {
    const file: RawImportFile = {
      fileName: 'shopee-large.csv',
      contentType: 'text/csv',
      bytes: new TextEncoder().encode(buildLargeCsv()),
    };

    const startedAt = performance.now();
    const result = await shopeeAdapter.parse(file, ctx);
    const elapsedMs = performance.now() - startedAt;
    console.log(`large-file parse: 5,000 rows in ${elapsedMs.toFixed(0)} ms`);

    expect(result.stats.rowsRead).toBe(5_000);
    expect(result.stats.ordersParsed).toBe(2_500);
    // The one bad line is skipped; all 4,999 good lines import.
    expect(result.stats.linesParsed).toBe(4_999);

    const badQuantities = result.issues.filter((issue) => issue.code === 'bad_quantity');
    expect(badQuantities).toHaveLength(1);
    // The header is row 1, so data row 1,234 is file row 1,235.
    expect(badQuantities[0]?.row).toBe(1_235);

    // The bad line belongs to the second line of order 617; the first line
    // must survive, because a bad row skips a LINE, never its whole order.
    const damaged = result.orders.find((order) => order.externalOrderId === '260214LARGE000617');
    expect(damaged?.lines).toHaveLength(1);
    expect(damaged?.lines[0]?.platformSku).toBe('SKU-000617-1');

    expect(elapsedMs).toBeLessThan(MS_BUDGET);
  });
});
