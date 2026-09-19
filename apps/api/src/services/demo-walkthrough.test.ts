/**
 * The 20-scene walkthrough, as one executable test.
 *
 * docs/demo-walkthrough.md section C promises exact onHand/stockValue numbers
 * at every scene. Two independent reviewers re-derived them from the seed, but
 * a promise is not a test: this file drives the REAL route handlers scene by
 * scene and asserts the whole chain, so nobody can shift the seed or a sample
 * file and land a wrong demo on stage.
 *
 * Everything the walkthrough writes is wiped in afterAll by seedDatabase()
 * (the same write `bun run db:seed` uses), which restores the exact opening
 * state for every suite that runs after this file.
 *
 * Needs DATABASE_URL; skips like every other DB-backed suite without one.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { R2Bucket } from '@cloudflare/workers-types';
import { SEED_IDS, createDb, seedDatabase } from '@stockhub/db';
import { dashboardRouter } from '../routes/dashboard';
import { importsRouter } from '../routes/imports';
import { inventoryRouter } from '../routes/inventory';
import { ordersRouter } from '../routes/orders';
import { MemoryR2Bucket, buildTestApp, jsonAs, requestAs, testEnv } from '../test-utils';

const url = process.env.DATABASE_URL;
const db = url ? createDb(url) : undefined;

const UREA = SEED_IDS.variants.fertUrea;
const COOP = SEED_IDS.customers.coop;
const HAT = SEED_IDS.variants.hat;
const SHOPEE_MAIN = SEED_IDS.channels.shopeeMain;
const LAZADA_MAIN = SEED_IDS.channels.lazadaMain;
const TIKTOK_LIVE = SEED_IDS.channels.tiktokLive;

const app = buildTestApp((v1) =>
  v1
    .route('/dashboard', dashboardRouter)
    .route('/inventory', inventoryRouter)
    .route('/imports', importsRouter)
    .route('/orders', ordersRouter),
);

interface SummaryWire {
  totalSkus: number;
  totalOnHand: number;
  lowStockCount: number;
  stockValue?: number;
  pendingImports: number;
  unmatchedSkus: number;
}

/** onHand and stockValue (satang) at every stock-touching scene, in order. */
const ON_HAND_CHAIN = [2822, 2882, 2932, 2919, 2906, 2890, 2890, 2895, 2795, 2793, 2795];
const VALUE_CHAIN = [
  37924500, 43924500, 49349500, 49240700, 48982700, 48852100, 48852100, 48881500, 38541500,
  38324500, 38541500,
];
const SCENE_LABELS = [
  'T0 เริ่มต้น',
  'S2 รับล็อต 1',
  'S3 รับล็อต 2',
  'S6 Shopee',
  'S7 Lazada',
  'S8 TikTok',
  'S9 import ซ้ำ',
  'S10 ยกเลิกผ่านไฟล์',
  'S12 บิลขายส่ง',
  'S15 บิลหน้าร้าน',
  'S16 ยกเลิกบิล',
];

const demoFile = (name: string): File =>
  new File(
    [
      readFileSync(
        new URL(`../../../../apps/web/public/demo-files/${name}`, import.meta.url).pathname,
      ),
    ],
    name,
    { type: 'text/csv' },
  );

let scene = 0;
const assertScene = async () => {
  const summary = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'owner');
  expect(`${SCENE_LABELS[scene]} onHand=${summary.totalOnHand}`).toBe(
    `${SCENE_LABELS[scene]} onHand=${ON_HAND_CHAIN[scene]}`,
  );
  expect(summary.stockValue).toBe(VALUE_CHAIN[scene]);
  scene += 1;
};

const uploadAndApply = async (
  file: File,
  channelId: string,
  matches: Array<{ platformSku: string; variantId: string }> = [],
): Promise<void> => {
  const form = new FormData();
  form.append('file', file);
  form.append('channelId', channelId);
  const uploadRes = await requestAs(app, '/api/v1/imports', 'owner', {
    method: 'POST',
    body: form,
  });
  expect(uploadRes.status).toBe(201);
  const created = (await uploadRes.json()) as { id: string };
  for (const match of matches) {
    const matchRes = await requestAs(app, `/api/v1/imports/${created.id}/match`, 'owner', {
      method: 'POST',
      body: JSON.stringify(match),
      headers: { 'content-type': 'application/json' },
    });
    expect(matchRes.status).toBe(200);
  }
  const applyRes = await requestAs(app, `/api/v1/imports/${created.id}/apply`, 'owner', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect([200, 201]).toContain(applyRes.status);
};

describe('guided demo walkthrough', () => {
  // The upload scene stores the original file in R2 - point the shared test
  // env at the in-memory bucket, exactly like routes/imports.test.ts does.
  testEnv.IMPORTS_BUCKET = new MemoryR2Bucket() as unknown as R2Bucket;

  test.skipIf(!db)(
    'keeps every promised number through all 20 scenes',
    async () => {
      if (!db) return;

      // Scene 1: the untouched seed - 19 SKUs, urea at 0 and below reorder, one
      // unknown SKU pending from the parked batch.
      const t0 = await jsonAs<SummaryWire>(app, '/api/v1/dashboard/summary', 'owner');
      expect(t0.totalSkus).toBe(19);
      expect(t0.lowStockCount).toBe(1);
      expect(t0.unmatchedSkus).toBe(1);
      await assertScene();

      // Scene 2 + 3: receive the two urea lots, different days, different costs.
      const lots = [
        {
          qty: 60,
          unitCost: 100_000,
          receivedAt: '2026-09-17T00:00:00+07:00',
          reference: 'PO-2026-070',
        },
        {
          qty: 50,
          unitCost: 108_500,
          receivedAt: '2026-09-18T00:00:00+07:00',
          reference: 'PO-2026-071',
        },
      ];
      for (const lot of lots) {
        const res = await requestAs(app, '/api/v1/inventory/receive', 'owner', {
          method: 'POST',
          body: JSON.stringify({ variantId: UREA, ...lot }),
          headers: { 'content-type': 'application/json' },
        });
        expect(res.status).toBe(201);
        await assertScene();
      }

      // Scene 4 + 5 + 6: shopee am - match the unknown hat SKU, then apply.
      await uploadAndApply(demoFile('shopee-demo-2026-09-19-am.csv'), SHOPEE_MAIN, [
        { platformSku: 'SHP-หมวก-XL', variantId: HAT },
      ]);
      await assertScene();

      // Scene 7: lazada, whose fourth row has no seller SKU.
      await uploadAndApply(demoFile('lazada-demo-2026-09-19.csv'), LAZADA_MAIN);
      await assertScene();

      // Scene 8: tiktok live - a bundle line plus loose gloves.
      await uploadAndApply(demoFile('tiktok-demo-2026-09-19.csv'), TIKTOK_LIVE);
      await assertScene();

      // Scene 9: the same shopee am file again - nothing may move.
      await uploadAndApply(demoFile('shopee-demo-2026-09-19-am.csv'), SHOPEE_MAIN);
      await assertScene();

      // Scene 10: shopee pm flips SPD26091901 to cancelled - stock comes back.
      await uploadAndApply(demoFile('shopee-demo-2026-09-19-pm.csv'), SHOPEE_MAIN);
      await assertScene();

      // Scene 11 + 12: the 100-sack wholesale bill. FIFO 60x1,000 + 40x1,085,
      // tier price 1,305.00 auto-applied.
      const wholesale = await jsonAs<{
        id: string;
        cogs?: number;
        lines: Array<{ unitPrice: number }>;
      }>(app, '/api/v1/orders', 'owner', {
        method: 'POST',
        body: JSON.stringify({
          channelKind: 'wholesale',
          customerId: COOP,
          lines: [{ variantId: UREA, quantity: 100 }],
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(wholesale.cogs).toBe(10_340_000);
      expect(wholesale.lines[0]?.unitPrice).toBe(130_500);
      await assertScene();

      // Scene 15: the storefront bill at retail, costed from the NEW lot.
      const pos = await jsonAs<{ id: string; cogs?: number; lines: Array<{ unitPrice: number }> }>(
        app,
        '/api/v1/orders',
        'owner',
        {
          method: 'POST',
          body: JSON.stringify({
            channelKind: 'pos',
            lines: [{ variantId: UREA, quantity: 2 }],
          }),
          headers: { 'content-type': 'application/json' },
        },
      );
      expect(pos.lines[0]?.unitPrice).toBe(145_000);
      expect(pos.cogs).toBe(217_000);
      await assertScene();

      // Scene 16: cancel the storefront bill - stock and cost return exactly.
      const cancelled = await requestAs(app, `/api/v1/orders/${pos.id}/cancel`, 'owner', {
        method: 'POST',
        body: JSON.stringify({ reason: 'ลูกค้าเปลี่ยนใจ (ฉากสาธิต)' }),
        headers: { 'content-type': 'application/json' },
      });
      expect(cancelled.status).toBe(200);
      await assertScene();

      // Scenes 13, 14, 17-20 are reads and role/reset behaviour - covered by
      // demo.test.ts, channels.test.ts, the route suites and the E2E checklist.
      expect(scene).toBe(ON_HAND_CHAIN.length);
    },
    60_000,
  );

  afterAll(async () => {
    if (!db) return;
    // Restore the exact opening state for every suite that runs after this
    // file - the same write `bun run db:seed` uses.
    await db.transaction((tx) => seedDatabase(tx));
    await db.$client.end();
  });
});
