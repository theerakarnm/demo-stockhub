/**
 * Runtime probe - see wrangler.toml for the why.
 *
 * Each handler catches its own errors and reports them as `{ ok: false,
 * error }` with HTTP 200, so one broken probe never hides the results of the
 * others. `/probe/all` is what CI and the deploy checklist curl.
 */

import { readTabular } from '@stockhub/adapters';
import type { RawImportFile } from '@stockhub/core';
import { Hono } from 'hono';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';

interface Env {
  /** Set in .dev.vars locally, `wrangler secret put DATABASE_URL` on staging. */
  DATABASE_URL?: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) =>
  c.json({
    worker: 'stockhub-runtime-probe',
    environment: c.env.ENVIRONMENT,
    probes: ['/probe/xlsx', '/probe/pdf', '/probe/pg', '/probe/all'],
  }),
);

/**
 * XLSX: build a workbook with the xlsx writer, then push the bytes through
 * `readTabular`, the exact decode path every marketplace import takes. The
 * sheet carries a Thai cell, because encoding bugs only show up with real
 * bytes, not ASCII.
 */
app.get('/probe/xlsx', (c) => {
  const headers = ['Order ID', 'Order Status', 'Seller SKU', 'Quantity', 'Product Name'] as const;
  const rows = [
    ['260214FAKE001', 'SHIPPED', 'BLD-3T-255', '1', 'จอบขุดดิน 3 ตะไบ พร้อมด้าม'],
    ['260214FAKE002', 'COMPLETED', 'GLV-01', '2', 'ถุงมือสวนยางพารา กันหนาม'],
    ['260214FAKE002', 'COMPLETED', 'GLV-01', '1', 'ถุงมือสวนยางพารา กันหนาม'],
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers as unknown as string[], ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'orders');
  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const file: RawImportFile = {
    fileName: 'probe.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: new Uint8Array(bytes),
  };
  const table = readTabular(file);

  const thaiRoundTrip = table.rows[0]?.['Product Name'] === (rows[0]?.[4] ?? null);
  const orderCount = new Set(table.rows.map((r) => r['Order ID'])).size;

  return c.json({
    ok: table.headers.length === headers.length && thaiRoundTrip && orderCount === 2,
    library: 'xlsx (SheetJS) write + @stockhub/adapters readTabular',
    headers: table.headers,
    dataRows: table.rows.length,
    distinctOrders: orderCount,
    thaiRoundTrip,
  });
});

/**
 * PDF: generate a real document and report the byte size and the magic header.
 * Note: StandardFonts are WinAnsi, so Thai text needs an embedded font - that
 * is a demo-week task, this probe only proves pdf-lib runs on workerd at all.
 */
app.get('/probe/pdf', async (c) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595.28, 841.89]); // A4
  page.drawText('StockHub runtime probe - pdf-lib on workerd', {
    x: 56,
    y: 780,
    size: 14,
    font,
    color: rgb(0.1, 0.12, 0.15),
  });
  const bytes = await pdf.save();

  return c.json({
    ok: bytes.byteLength > 500 && (bytes[0] ?? 0) === 0x25 && (bytes[1] ?? 0) === 0x50,
    library: 'pdf-lib',
    byteLength: bytes.byteLength,
    magic: String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0),
  });
});

/**
 * Postgres: connect through `createDb(url, { runtime: 'worker' })`, the same
 * worker options @stockhub/api uses behind Hyperdrive, and read real seeded
 * rows. Without DATABASE_URL the probe reports not-configured instead of
 * failing, so the staging deploy stays green.
 */
app.get('/probe/pg', async (c) => {
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: null, configured: false, note: 'DATABASE_URL is not set' });
  }
  try {
    const { createDb } = await import('@stockhub/db');
    const db = createDb(c.env.DATABASE_URL, { runtime: 'worker' });
    const version = (await db.execute(
      'select version() as version, (select count(*) from products) as products',
    )) as Array<{ version: string; products: number }>;
    await db.$client.end();
    const row = version[0];
    if (!row) {
      return c.json({ ok: false, configured: true, error: 'query returned no rows' });
    }
    return c.json({
      ok: row.products > 0,
      configured: true,
      version: row.version.split(' ').slice(0, 2).join(' '),
      products: row.products,
    });
  } catch (error) {
    return c.json({
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/probe/all', async (c) => {
  const [xlsx, pdf, pg] = await Promise.all([
    app.request('/probe/xlsx', undefined, { ENVIRONMENT: c.env.ENVIRONMENT }),
    app.request('/probe/pdf', undefined, { ENVIRONMENT: c.env.ENVIRONMENT }),
    app.request('/probe/pg', undefined, {
      DATABASE_URL: c.env.DATABASE_URL,
      ENVIRONMENT: c.env.ENVIRONMENT,
    }),
  ]);
  const body = async (r: Response) => await r.json();
  const results = { xlsx: await body(xlsx), pdf: await body(pdf), pg: await body(pg) };
  return c.json({ environment: c.env.ENVIRONMENT, ...results });
});

export default app;
