/**
 * Test-only helpers. Not exported from src/index.ts.
 */

import { readFileSync } from 'node:fs';
import type { RawImportFile } from '@stockhub/core';

/** Loads a file from ../fixtures as it would arrive from the upload endpoint. */
export const loadFixture = (fileName: string): RawImportFile => {
  const url = new URL(`../fixtures/${fileName}`, import.meta.url);
  return {
    fileName,
    // Browsers report this for a .csv picked from a Windows machine with Excel
    // installed, which is exactly why sniffFormat ignores it.
    contentType: 'application/vnd.ms-excel',
    bytes: new Uint8Array(readFileSync(url)),
  };
};

export const SHOPEE_FIXTURE = 'shopee-orders.sample.csv';
export const LAZADA_FIXTURE = 'lazada-orders.sample.csv';
export const TIKTOK_FIXTURE = 'tiktok-orders.sample.csv';

/** A file that belongs to no marketplace, for the negative detection tests. */
export const notAnExport = (): RawImportFile => ({
  fileName: 'shopping-list.csv',
  contentType: 'text/csv',
  bytes: new TextEncoder().encode('name,note\nกาแฟ,ซื้อพรุ่งนี้\nน้ำตาล,เหลือครึ่งถุง\n'),
});
