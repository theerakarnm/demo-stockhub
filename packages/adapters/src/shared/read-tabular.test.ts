/**
 * File reader tests, using the sample exports. Real - read-tabular.ts is
 * fully implemented.
 */

import { describe, expect, test } from 'bun:test';
import { LAZADA_FIXTURE, SHOPEE_FIXTURE, TIKTOK_FIXTURE, loadFixture } from '../test-helpers';
import { decodeText, readTabular, sniffFormat } from './read-tabular';

describe('sniffFormat', () => {
  test('ignores the browser content type and looks at the bytes', () => {
    // The fixture is declared as application/vnd.ms-excel on purpose.
    expect(sniffFormat(loadFixture(SHOPEE_FIXTURE))).toBe('csv');
  });

  test('recognises a zip header as xlsx', () => {
    expect(
      sniffFormat({
        fileName: 'orders.bin',
        contentType: 'application/octet-stream',
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
      }),
    ).toBe('xlsx');
  });
});

describe('decodeText', () => {
  test('strips the UTF-8 BOM that Shopee exports carry', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x62]);
    expect(decodeText(bytes)).toBe('ab');
  });
});

describe('readTabular', () => {
  test('reads the Shopee sample without a BOM artefact on the first header', () => {
    const table = readTabular(loadFixture(SHOPEE_FIXTURE));
    expect(table.headers[0]).toBe('หมายเลขคำสั่งซื้อ');
    expect(table.rows).toHaveLength(5);
    expect(table.rows[0]?.['เลขอ้างอิง SKU (SKU Reference No.)']).toBe('HOE-001');
  });

  test('keeps quoted cells containing a thousands separator intact', () => {
    const table = readTabular(loadFixture(SHOPEE_FIXTURE));
    expect(table.rows[3]?.ราคาขาย).toBe('฿1,890.00');
  });

  test('reads the Lazada sample', () => {
    const table = readTabular(loadFixture(LAZADA_FIXTURE));
    expect(table.headers).toContain('orderItemId');
    expect(table.rows).toHaveLength(5);
  });

  test('skips the TikTok description row', () => {
    const table = readTabular(loadFixture(TIKTOK_FIXTURE), {
      headerRow: 0,
      skipRowsAfterHeader: 1,
    });
    expect(table.rows).toHaveLength(4);
    expect(table.rows[0]?.['Order ID']).toBe('577000000000000001');
  });

  test('maxRows: 0 reads headers only', () => {
    const table = readTabular(loadFixture(LAZADA_FIXTURE), { maxRows: 0 });
    expect(table.headers.length).toBeGreaterThan(0);
    expect(table.rows).toHaveLength(0);
  });
});
