/**
 * XLSX round-trip tests.
 *
 * The upload endpoint accepts .xlsx as well as .csv, but binary fixtures are
 * never committed (they are unreviewable and bloat git). So each test rebuilds
 * a workbook IN MEMORY from the CSV fixture with SheetJS and then proves the
 * adapters produce exactly the same orders from it. That is the executable
 * version of the "CSV or XLSX, same orders" promise in read-tabular.ts.
 */

import { describe, expect, test } from 'bun:test';
import type { NormalizedOrder, RawImportFile } from '@stockhub/core';
import * as XLSX from 'xlsx';
import { detectAdapter } from './registry';
import { DEFAULT_TIME_ZONE } from './shared/parse-values';
import { readTabular } from './shared/read-tabular';
import { shopeeAdapter } from './shopee/adapter';
import { SHOPEE_FIXTURE, TIKTOK_FIXTURE, loadFixture } from './test-helpers';
import { tiktokAdapter } from './tiktok/adapter';

const ctx = { timeZone: DEFAULT_TIME_ZONE };

/**
 * Builds a RawImportFile whose bytes are a real .xlsx, assembled in memory
 * from a CSV fixture: header row, optionally the TikTok description row, then
 * the data rows. No binary ever touches disk.
 */
const toXlsx = (csvFixture: string, keepDescriptionRow: boolean): RawImportFile => {
  const table = readTabular(loadFixture(csvFixture));
  // With no skipRowsAfterHeader, the TikTok description row arrives as rows[0];
  // it only goes into the sheet when the caller asks to keep it.
  const descriptionRow = keepDescriptionRow ? table.rows[0] : undefined;
  const dataRows = keepDescriptionRow ? table.rows.slice(1) : table.rows;

  const matrix: string[][] = [[...table.headers]];
  if (descriptionRow !== undefined) {
    matrix.push(table.headers.map((header) => descriptionRow[header] ?? ''));
  }
  for (const row of dataRows) {
    matrix.push(table.headers.map((header) => row[header] ?? ''));
  }

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), 'orders');
  const written: unknown = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  if (!(written instanceof ArrayBuffer)) {
    throw new Error('XLSX.write({ type: "array" }) must return an ArrayBuffer');
  }
  return {
    fileName: csvFixture.replace(/\.csv$/, '.xlsx'),
    // sniffFormat looks at the bytes, so this MIME type is decorative.
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: new Uint8Array(written),
  };
};

/** Dates become ISO strings and undefined fields vanish, on both sides alike. */
const canonical = (orders: readonly NormalizedOrder[]): unknown =>
  JSON.parse(JSON.stringify(orders));

describe('xlsx round-trip', () => {
  test('shopee: the xlsx parses to the same orders as the csv', async () => {
    const fromCsv = await shopeeAdapter.parse(loadFixture(SHOPEE_FIXTURE), ctx);
    const fromXlsx = await shopeeAdapter.parse(toXlsx(SHOPEE_FIXTURE, false), ctx);

    expect(fromXlsx.stats.ordersParsed).toBe(fromCsv.stats.ordersParsed);
    expect(canonical(fromXlsx.orders)).toEqual(canonical(fromCsv.orders));
  });

  test('shopee: detectAdapter names the xlsx as shopee', async () => {
    const detection = await detectAdapter(toXlsx(SHOPEE_FIXTURE, false));
    expect(detection?.kind).toBe('shopee');
  });

  test('tiktok: the xlsx with its description row parses to the same orders as the csv', async () => {
    const fromCsv = await tiktokAdapter.parse(loadFixture(TIKTOK_FIXTURE), ctx);
    const fromXlsx = await tiktokAdapter.parse(toXlsx(TIKTOK_FIXTURE, true), ctx);

    expect(fromXlsx.stats.ordersParsed).toBe(fromCsv.stats.ordersParsed);
    expect(canonical(fromXlsx.orders)).toEqual(canonical(fromCsv.orders));
  });

  test('tiktok: detectAdapter names the xlsx as tiktok', async () => {
    const detection = await detectAdapter(toXlsx(TIKTOK_FIXTURE, true));
    expect(detection?.kind).toBe('tiktok');
  });
});
