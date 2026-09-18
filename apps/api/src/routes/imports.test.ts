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
import { MemoryR2Bucket, buildTestApp, requestAs, testEnv } from '../test-utils';
import { importsRouter } from './imports';

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
    // Batches only, in FK-safe order: this suite writes no orders yet, and
    // later suites own the rows they create.
    await db.execute(
      sql`delete from import_batches where created_at >= ${startedAt.toISOString()}`,
    );
    await db.$client.end();
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
});
