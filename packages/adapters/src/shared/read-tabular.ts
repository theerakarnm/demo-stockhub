/**
 * Turns an uploaded file into a plain table: `{ headers, rows }`.
 *
 * This is pure plumbing, so it is implemented for real. Everything above it
 * (the three marketplace adapters) only ever sees `Record<string, string>` rows
 * and never has to care whether the seller exported CSV or XLSX.
 *
 * WHY THIS FILE EXISTS
 *   Shopee, Lazada and TikTok all change their export format from time to time,
 *   but they all keep exporting "a sheet with a header row". Keeping the file
 *   decoding in one place means a format change is a `columns.ts` edit, not a
 *   rewrite.
 *
 * XLSX LIBRARY CHOICE: `xlsx` (SheetJS) over `exceljs`.
 *   1. SheetJS is synchronous and reads straight from a `Uint8Array`, which is
 *      exactly what the upload endpoint already has in memory.
 *   2. It has no Node stream / `fs` dependency, so the same adapter code runs in
 *      the Cloudflare Workers runtime that hosts apps/api. `exceljs` pulls in
 *      Node streams and `zip` internals and does not run there unbundled.
 *   3. The surface we need is two calls: `read` + `sheet_to_json`.
 *   SECURITY NOTE: npm only carries SheetJS up to 0.18.5, which has two known
 *   advisories (prototype pollution, ReDoS) fixed in 0.19.3 / 0.20.2 that are
 *   published on the SheetJS CDN only. We parse seller-supplied files, so this
 *   matters. TODO(template): before go-live, either pin the CDN build
 *   (`bun add xlsx@https://cdn.sheetjs.com/xlsx-0.20.x/xlsx-0.20.x.tgz`) or
 *   move the XLSX branch to exceljs. The rest of this file does not change
 *   either way - that is why the library sits behind `readTabular`.
 *
 *   Trade-off: SheetJS gives us no streaming, so a very large export is read
 *   fully into memory. Marketplace daily exports are a few thousand rows, which
 *   is fine. If an org ever uploads a 200k row file, revisit this decision and
 *   move the parse to a queue consumer.
 *
 * ENCODING RISK - READ BEFORE DEBUGGING "ภาษาไทยเพี้ยน":
 *   Shopee CSV exports are UTF-8 *with* a BOM. We strip it below.
 *   Some older Thai tooling (and anything that has been round-tripped through an
 *   old Excel for Windows) is TIS-620 / CP874, not UTF-8. Decoding TIS-620 bytes
 *   as UTF-8 produces replacement characters (U+FFFD) in every Thai string.
 *   We deliberately do NOT auto-convert yet: guessing wrong corrupts data
 *   silently. `looksLikeMojibake()` below flags it so the import screen can tell
 *   the user "save the file as UTF-8 CSV and upload again".
 *   TODO(template): if customers hit this often, add a real TIS-620 decoder
 *   (`new TextDecoder('windows-874')` works in Node/Bun but NOT in Workers).
 */

import type { RawImportFile } from '@stockhub/core';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type TabularFormat = 'csv' | 'xlsx';

export interface TabularFile {
  format: TabularFormat;
  /** Header row, verbatim (not normalised). Use header-match.ts to look up. */
  headers: string[];
  /** One entry per data row, keyed by the verbatim header. Values are strings. */
  rows: Record<string, string>[];
}

export interface ReadTabularOptions {
  /**
   * 0-based index of the header row. TikTok Shop exports put a human-readable
   * description row directly under the real header, hence this knob.
   */
  headerRow?: number;
  /** Data rows to drop directly after the header row (TikTok: 1). */
  skipRowsAfterHeader?: number;
  /** Stop after N data rows. `detect()` uses 0 to read headers only. */
  maxRows?: number;
}

/** ZIP local file header - every .xlsx is a zip archive. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** OLE2 compound document - the legacy .xls format. SheetJS reads it too. */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

const startsWith = (bytes: Uint8Array, magic: number[]): boolean =>
  magic.every((byte, i) => bytes[i] === byte);

/**
 * Content sniffing beats the browser-reported MIME type, which is wrong often
 * enough to matter (Excel-generated CSV frequently arrives as
 * `application/vnd.ms-excel`). Extension is only the tie-breaker.
 */
export const sniffFormat = (file: RawImportFile): TabularFormat => {
  if (startsWith(file.bytes, ZIP_MAGIC) || startsWith(file.bytes, OLE2_MAGIC)) {
    return 'xlsx';
  }
  const lower = file.fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  return 'csv';
};

/** Strips a UTF-8 BOM and decodes as UTF-8. See the encoding note at the top. */
export const decodeText = (bytes: Uint8Array): string => {
  const text = new TextDecoder('utf-8').decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
};

/**
 * True when a decoded string is full of U+FFFD, which almost always means the
 * file was really TIS-620 / CP874. The import screen surfaces this as a warning.
 */
export const looksLikeMojibake = (text: string): boolean => {
  const sample = text.slice(0, 4000);
  if (sample.length === 0) return false;
  const bad = sample.split('\ufffd').length - 1;
  return bad / sample.length > 0.02;
};

/** Makes duplicate headers addressable: ['a','a'] -> ['a','a (2)']. */
const uniqueHeaders = (raw: readonly (string | undefined)[]): string[] => {
  const seen = new Map<string, number>();
  return raw.map((value, i) => {
    const base = (value ?? '').trim() || `column_${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
};

const csvToMatrix = (text: string, maxRows?: number): string[][] => {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    // `preview` counts every row including the header, so ask for one extra.
    ...(maxRows === undefined ? {} : { preview: maxRows + 1 }),
  });
  return result.data.map((row) => row.map((cell) => (cell ?? '').toString()));
};

const xlsxToMatrix = (bytes: Uint8Array): string[][] => {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (sheetName === undefined) return [];
  const sheet = workbook.Sheets[sheetName];
  if (sheet === undefined) return [];
  // `raw: false` gives us the *displayed* string, so a date cell arrives as the
  // text the seller saw in Excel. Adapters then parse it with parse-values.ts.
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
};

/** Reads the whole file into a table. Rows keep their verbatim header keys. */
export const readTabular = (file: RawImportFile, options: ReadTabularOptions = {}): TabularFile => {
  const format = sniffFormat(file);
  const headerRow = options.headerRow ?? 0;
  const skip = options.skipRowsAfterHeader ?? 0;

  const matrix =
    format === 'csv'
      ? csvToMatrix(
          decodeText(file.bytes),
          options.maxRows === undefined ? undefined : options.maxRows + headerRow + skip,
        )
      : xlsxToMatrix(file.bytes);

  const headers = uniqueHeaders(matrix[headerRow] ?? []);
  const dataRows = matrix.slice(headerRow + 1 + skip);
  const limited = options.maxRows === undefined ? dataRows : dataRows.slice(0, options.maxRows);

  const rows = limited.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? '').toString().trim();
    });
    return row;
  });

  return { format, headers, rows };
};

/**
 * Header-only read for `detect()`. The port contract says detect must be cheap,
 * so never call `readTabular` without `maxRows` from an adapter's detect().
 */
export const readHeaders = (
  file: RawImportFile,
  options: Pick<ReadTabularOptions, 'headerRow'> = {},
): string[] => readTabular(file, { ...options, maxRows: 0 }).headers;
