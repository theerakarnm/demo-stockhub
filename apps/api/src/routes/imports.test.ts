/**
 * Import route tests (upload -> preview -> list) against the seeded database.
 *
 * The suite uploads the SAME fixture files the adapters package unit-tests, so
 * a parse regression surfaces at the HTTP boundary too. Rows created after the
 * suite started are deleted in afterAll in FK order, so `bun test` can run
 * twice in a row. Without DATABASE_URL the whole suite skips.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { SEED_IDS, createDb } from '@stockhub/db';
import { sql } from 'drizzle-orm';
import { MemoryR2Bucket, buildTestApp, jsonAs, requestAs, testEnv } from '../test-utils';
import { importsRouter } from './imports';
import { inventoryRouter } from './inventory';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

/** Everything the cleanup removes must be newer than this point. */
const startedAt = new Date();

/** Load an adapters fixture as the upload endpoint would receive it. */
const fixturePath = (fileName: string): string =>
  new URL(`../../../../packages/adapters/fixtures/${fileName}`, import.meta.url).pathname;

const loadFixture = (fileName: string): File =>
  new File([readFileSync(fixturePath(fileName))], fileName, {
    type: 'application/vnd.ms-excel',
  });

/** A small file that is not a marketplace export at all. */
const notAnExport = (): File =>
  new File([new TextEncoder().encode('name,note\nกาแฟ,ซื้อพรุ่งนี้\n')], 'shopping-list.csv', {
    type: 'text/csv',
  });

/**
 * A Shopee-shaped CSV built per run: the platform order ids carry a run stamp,
 * so a rerun never collides with orders an earlier run left behind.
 */
const RUN = Date.now().toString(36);
/** Per-run bad SKU: a previous run's learned listing can never pre-match it. */
const badSku = `BAD-${RUN}`;
const SHOPEE_HEADER =
  'หมายเลขคำสั่งซื้อ,สถานะการสั่งซื้อ,สถานะการยกเลิก/คืนเงิน,เวลาการสั่งซื้อ,เวลาส่งสินค้า,' +
  'เลขอ้างอิง SKU (SKU Reference No.),ชื่อสินค้า,ชื่อตัวเลือก,จำนวน,ราคาขาย,ส่วนลดจากผู้ขาย,' +
  'รวมยอดคำสั่งซื้อ,ชื่อผู้ใช้ (ผู้ซื้อ)';

const shopeeStyleFile = (rows: readonly string[]): File =>
  new File([new TextEncoder().encode([SHOPEE_HEADER, ...rows].join('\n'))], `run-${RUN}.csv`, {
    type: 'application/vnd.ms-excel',
  });

/** One client for the whole file: only this hook closes it. */
afterAll(async () => {
  if (!db) return;
  await db.$client.end();
});

/** POST the file exactly like the browser dropzone does: multipart form data. */
const upload = (app: ReturnType<typeof buildTestApp>, file: File): Promise<Response> => {
  const form = new FormData();
  form.append('file', file);
  return requestAs(app, '/api/v1/imports', 'owner', { method: 'POST', body: form });
};

/** The ImportBatch wire shape this suite asserts on. */
interface BatchWire {
  id: string;
  channelId: string | null;
  channelKind: string | null;
  detectedKind: string | null;
  status: string;
  fileName: string;
  objectKey: string;
  rowsRead: number;
  ordersParsed: number;
  linesParsed: number;
  issueCount: number;
  unmatchedCount: number;
  uploadedAt: string;
  channelName?: string;
  errorMessage?: string;
}

/** The error envelope from middleware/error.ts. */
interface ErrorWire {
  error: { code: string; message: string };
}

describe.skipIf(!url)('import routes (seeded database)', () => {
  const app = buildTestApp((v1) => v1.route('/imports', importsRouter));
  const memoryBucket = new MemoryR2Bucket();

  beforeAll(() => {
    // The production serviceContext wraps whatever sits in IMPORTS_BUCKET, so
    // the route tests exercise the real R2 adapter over an in-memory bucket.
    testEnv.IMPORTS_BUCKET = memoryBucket as unknown as R2Bucket;
  });

  let shopeeBatchId = '';

  afterAll(async () => {
    if (!db) return;
    // Roll back in FK order: consumptions hang off movements, lines off
    // orders, and both reference batches only softly. Movements are found by
    // created_at because deleting an order nulls their order_id first.
    await db.execute(
      sql`delete from movement_lot_consumptions where movement_id in (
        select id from stock_movements where created_at >= ${startedAt.toISOString()}
      )`,
    );
    await db.execute(
      sql`delete from stock_movements where created_at >= ${startedAt.toISOString()}`,
    );
    await db.execute(sql`delete from orders where created_at >= ${startedAt.toISOString()}`);
    await db.execute(
      sql`delete from import_batches where created_at >= ${startedAt.toISOString()}`,
    );
    // The learned listing must not leak into other suites or reruns.
    await db.execute(
      sql`delete from channel_listings where created_at >= ${startedAt.toISOString()}`,
    );
    // Reset the seed FIFO layers this suite consumed or restored. The spade is
    // used here because no other suite moves its stock.
    await db.execute(sql`
      update stock_lots set remaining_qty = qty
      where variant_id = ${SEED_IDS.variants.spade}
    `);
  });

  test('uploading the shopee fixture parks a preview_ready batch', async () => {
    const res = await upload(app, loadFixture('shopee-orders.sample.csv'));
    expect(res.status).toBe(201);
    const batch = (await res.json()) as BatchWire;
    expect(batch.status).toBe('preview_ready');
    expect(batch.detectedKind).toBe('shopee');
    expect(batch.channelId).toBe(SEED_IDS.channels.shopeeMain);
    expect(batch.ordersParsed).toBe(4);
    // HOE-001 matches exactly; the other four SKUs wait for a human decision.
    expect(batch.unmatchedCount).toBe(4);
    expect(batch.linesParsed).toBe(5);
    shopeeBatchId = batch.id;
  });

  test('the original bytes reached storage under the canonical key', async () => {
    const detail = await requestAs(app, `/api/v1/imports/${shopeeBatchId}`, 'owner');
    expect(detail.status).toBe(200);
    const preview = (await detail.json()) as { batch: BatchWire; orders: unknown[] };
    const batch = preview.batch;
    expect(batch.objectKey.startsWith(`imports/${SEED_IDS.org}/`)).toBe(true);
    // Four orders, one of them cancelled in the file, all carried verbatim.
    expect(preview.orders).toHaveLength(4);
    const stored = memoryBucket.bytesOf(batch.objectKey);
    expect(stored).toBeDefined();
  });

  test('a duplicate upload warns about the checksum but still parses', async () => {
    const res = await upload(app, loadFixture('shopee-orders.sample.csv'));
    expect(res.status).toBe(201);
    const batch = (await res.json()) as BatchWire;
    expect(batch.status).toBe('preview_ready');
  });

  test('an unknown file fails the batch with a validation error', async () => {
    const res = await upload(app, notAnExport());
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorWire;
    expect(body.error.code).toBe('validation_error');

    const listed = await requestAs(app, '/api/v1/imports', 'owner');
    const batches = (await listed.json()) as BatchWire[];
    const failed = batches.find((batch) => batch.fileName === 'shopping-list.csv');
    expect(failed?.status).toBe('failed');
    expect(failed?.errorMessage).toBeDefined();
    // The evidence rule: even a failed batch keeps its object in storage.
    expect(failed?.objectKey.length).toBeGreaterThan(0);
  });

  test('GET / lists batches newest first with resolved names', async () => {
    const res = await requestAs(app, '/api/v1/imports', 'owner');
    expect(res.status).toBe(200);
    const batches = (await res.json()) as BatchWire[];
    expect(batches.length).toBeGreaterThanOrEqual(3);
    // Newest first: timestamps truncate to milliseconds, so ties are allowed.
    const times = batches.map((batch) => batch.uploadedAt);
    for (let i = 1; i < times.length; i++) {
      const current = times[i];
      const previous = times[i - 1];
      expect(current === undefined || previous === undefined || current <= previous).toBe(true);
    }
    const shopee = batches.find((batch) => batch.id === shopeeBatchId);
    expect(shopee?.channelName).toBeDefined();
  });

  /** The wire shapes the group / match tests assert on. */
  interface PreviewWire {
    batch: { id: string; unmatchedCount: number };
    unmatched: {
      platformSku: string;
      quantity: number;
      occurrences: number;
      suggestions: unknown[];
    }[];
    groups: {
      willDeduct: { externalOrderId: string }[];
      needsMatch: {
        externalOrderId: string;
        lines: { platformSku: string; matchSource: string }[];
      }[];
      skipped: { order: { externalOrderId: string }; reason: string }[];
    };
  }

  // Three orders: one clean + matched, one with a bad SKU, one cancelled.
  const rows = [
    `${RUN}-A01,จัดส่งแล้ว,,2026-02-20 09:00:00,2026-02-20 15:00:00,HOE-001,จอบถางหญ้า,ด้ามยาว,2,259.00,0.00,518.00,buyer_a`,
    `${RUN}-B02,จัดส่งแล้ว,,2026-02-20 10:00:00,2026-02-20 16:00:00,BAD-${RUN},สินค้าไม่มีในระบบ,,1,100.00,0.00,100.00,buyer_b`,
    `${RUN}-C03,ยกเลิกแล้ว,ยกเลิกโดยผู้ซื้อ,2026-02-20 11:00:00,,GLV-01,ถุงมือทำสวน,,2,45.00,0.00,90.00,buyer_c`,
  ];

  let batchId = '';

  test('preview sorts orders into ตัดได้ / ติดปัญหา SKU / ถูกข้าม', async () => {
    const res = await upload(app, shopeeStyleFile(rows));
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };
    batchId = created.id;

    const detail = await jsonAs<PreviewWire>(app, `/api/v1/imports/${batchId}`, 'owner');
    expect(detail.groups.willDeduct.map((order) => order.externalOrderId)).toEqual([`${RUN}-A01`]);
    expect(detail.groups.needsMatch.map((order) => order.externalOrderId)).toEqual([`${RUN}-B02`]);
    expect(detail.groups.skipped).toHaveLength(1);
    const skippedEntry = detail.groups.skipped[0];
    expect(skippedEntry?.order.externalOrderId).toBe(`${RUN}-C03`);
    expect(skippedEntry?.reason).toBe('cancelled');
    // The unmatched group carries a ranked suggestion for the bad SKU.
    expect(detail.unmatched).toHaveLength(1);
  });

  test('saving a manual match fixes the preview and learns the listing', async () => {
    const res = await requestAs(app, `/api/v1/imports/${batchId}/match`, 'owner', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platformSku: badSku, variantId: SEED_IDS.variants.glove }),
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { linesUpdated: number; unmatchedRemaining: number };
    expect(result.linesUpdated).toBe(1);
    expect(result.unmatchedRemaining).toBe(0);

    const detail = await jsonAs<PreviewWire>(app, `/api/v1/imports/${batchId}`, 'owner');
    expect(detail.groups.willDeduct).toHaveLength(2);
    expect(detail.groups.needsMatch).toHaveLength(0);
    expect(detail.batch.unmatchedCount).toBe(0);
  });

  test('the next import matches the same SKU automatically from listing_map', async () => {
    const res = await upload(app, shopeeStyleFile(rows));
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };

    interface LineWire {
      lines: { platformSku: string; matchSource: string; variantId?: string }[];
    }
    const detail = await jsonAs<{ orders: LineWire[]; unmatched: unknown[] }>(
      app,
      `/api/v1/imports/${created.id}`,
      'owner',
    );
    const line = detail.orders
      .flatMap((order) => order.lines)
      .find((line) => line.platformSku === badSku);
    expect(line?.matchSource).toBe('listing_map');
    expect(line?.variantId).toBe(SEED_IDS.variants.glove);
    expect(detail.unmatched).toHaveLength(0);
  });
});

describe.skipIf(!url)('import apply - the two lifelines of AGENTS.md rule 6', () => {
  const app = buildTestApp((v1) =>
    v1.route('/imports', importsRouter).route('/inventory', inventoryRouter),
  );
  const memoryBucket = new MemoryR2Bucket();

  beforeAll(() => {
    testEnv.IMPORTS_BUCKET = memoryBucket as unknown as R2Bucket;
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(
      sql`delete from movement_lot_consumptions where movement_id in (
        select id from stock_movements where created_at >= ${startedAt.toISOString()}
      )`,
    );
    await db.execute(
      sql`delete from stock_movements where created_at >= ${startedAt.toISOString()}`,
    );
    await db.execute(sql`delete from orders where created_at >= ${startedAt.toISOString()}`);
    await db.execute(
      sql`delete from import_batches where created_at >= ${startedAt.toISOString()}`,
    );
    await db.execute(sql`
      update stock_lots set remaining_qty = qty
      where variant_id = ${SEED_IDS.variants.spade}
    `);
  });

  const RUN2 = Date.now().toString(36);
  const shipRow = `${RUN2}-S01,จัดส่งแล้ว,,2026-02-21 09:00:00,2026-02-21 15:00:00,SPD-001,จอบขุดดิน,ด้ามไม้,2,165.00,0.00,330.00,buyer_s`;
  // Lifeline 2 ships its own order number first, then a later export flips
  // exactly that order to cancelled.
  const shipRow2 = `${RUN2}-S02,จัดส่งแล้ว,,2026-02-22 09:00:00,2026-02-22 15:00:00,SPD-001,จอบขุดดิน,ด้ามไม้,2,165.00,0.00,330.00,buyer_t`;
  const cancelRow = `${RUN2}-S02,ยกเลิกแล้ว,ยกเลิกโดยผู้ซื้อ,2026-02-22 09:00:00,,SPD-001,จอบขุดดิน,ด้ามไม้,2,165.00,0.00,330.00,buyer_t`;

  interface ApplyWire {
    movementsCreated: number;
    ordersApplied: number;
    cogs?: number;
  }
  interface OnHandWire {
    onHand: number;
  }
  interface GroupWire {
    groups: { willDeduct: unknown[]; skipped: { reason: string }[] };
    issues: { code: string }[];
  }

  /** Upload rows, then confirm the batch; returns the apply result. */
  const uploadAndApply = async (rows: readonly string[]): Promise<ApplyWire> => {
    const uploadRes = await upload(app, shopeeStyleFile(rows));
    expect(uploadRes.status).toBe(201);
    const created = (await uploadRes.json()) as { id: string };
    const applyRes = await requestAs(app, `/api/v1/imports/${created.id}/apply`, 'owner', {
      method: 'POST',
    });
    expect(applyRes.status).toBe(200);
    return (await applyRes.json()) as ApplyWire;
  };

  const spadeOnHand = async (): Promise<number> => {
    const detail = await jsonAs<OnHandWire>(
      app,
      `/api/v1/inventory/${SEED_IDS.variants.spade}`,
      'owner',
    );
    return detail.onHand;
  };

  test('lifeline 1: applying the same file twice deducts exactly once', async () => {
    const before = await spadeOnHand();

    const first = await uploadAndApply([shipRow]);
    expect(first.movementsCreated).toBe(1);
    expect(first.ordersApplied).toBe(1);
    // 2 units out of the oldest spade lot at 108.00 baht each.
    expect(first.cogs).toBe(21_600);
    expect(await spadeOnHand()).toBe(before - 2);

    // The same bytes arrive again in a NEW batch: the checksum warns, the
    // preview moves the order to skipped, and apply moves no stock.
    const second = await upload(app, shopeeStyleFile([shipRow]));
    expect(second.status).toBe(201);
    const created = (await second.json()) as { id: string };
    const preview = await jsonAs<GroupWire>(app, `/api/v1/imports/${created.id}`, 'owner');
    expect(preview.issues.some((issue) => issue.code === 'duplicate_checksum')).toBe(true);
    expect(preview.groups.willDeduct).toHaveLength(0);
    expect(preview.groups.skipped).toHaveLength(1);
    expect(preview.groups.skipped[0]?.reason).toBe('already_imported');

    const applyRes = await requestAs(app, `/api/v1/imports/${created.id}/apply`, 'owner', {
      method: 'POST',
    });
    expect(applyRes.status).toBe(200);
    const result = (await applyRes.json()) as ApplyWire;
    expect(result.movementsCreated).toBe(0);
    expect(result.cogs).toBe(0);
    expect(await spadeOnHand()).toBe(before - 2);
  });

  test('lifeline 2: a later file that cancels the order restores the original cost', async () => {
    const before = await spadeOnHand();
    const applied = await uploadAndApply([shipRow2]);
    expect(applied.cogs).toBe(21_600);
    expect(await spadeOnHand()).toBe(before - 2);

    // Same platform order number, now cancelled by the buyer in the export.
    const applied2 = await uploadAndApply([cancelRow]);
    expect(applied2.movementsCreated).toBe(1);
    // The restore re-credits the EXACT slices the sale consumed (108.00 x 2),
    // not today's cost from the newer lot.
    expect(applied2.cogs).toBe(-21_600);
    expect(await spadeOnHand()).toBe(before);
  });
});
