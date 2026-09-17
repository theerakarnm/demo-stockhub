/**
 * Lazada adapter tests.
 *
 * detect() is implemented, so the detect block MUST PASS.
 * parse() still has its TODO block, so the parse block is `test.skip` with the
 * assertions already written - delete `.skip` one test at a time as you fill in
 * TODO BLOCK 1 and TODO BLOCK 2 in adapter.ts. That is your TDD loop.
 */

import { describe, expect, test } from 'bun:test';
import { satang } from '@stockhub/core';
import { DEFAULT_TIME_ZONE } from '../shared/parse-values';
import {
  LAZADA_FIXTURE,
  SHOPEE_FIXTURE,
  TIKTOK_FIXTURE,
  loadFixture,
  notAnExport,
} from '../test-helpers';
import { lazadaAdapter } from './adapter';

const ctx = { timeZone: DEFAULT_TIME_ZONE };

describe('lazadaAdapter.detect', () => {
  test('recognises its own export with high confidence', async () => {
    const result = await lazadaAdapter.detect(loadFixture(LAZADA_FIXTURE));
    expect(result.kind).toBe('lazada');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.reason).toContain('Lazada');
  });

  test('does not claim another marketplace export', async () => {
    for (const other of [SHOPEE_FIXTURE, TIKTOK_FIXTURE]) {
      const result = await lazadaAdapter.detect(loadFixture(other));
      expect(result.confidence).toBeLessThan(0.6);
    }
  });

  test('scores an unrelated csv at zero', async () => {
    const result = await lazadaAdapter.detect(notAnExport());
    expect(result.confidence).toBe(0);
  });
});

describe('lazadaAdapter.parse', () => {
  test.skip('parses every order in the sample export', async () => {
    const result = await lazadaAdapter.parse(loadFixture(LAZADA_FIXTURE), ctx);

    expect(result.stats.rowsRead).toBe(5);
    expect(result.stats.ordersParsed).toBe(4);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
  });

  test.skip('collapses the two per-unit rows of order ...002 into qty 2', async () => {
    const result = await lazadaAdapter.parse(loadFixture(LAZADA_FIXTURE), ctx);
    const order = result.orders.find((o) => o.externalOrderId === '900000000000002');

    // Lazada exports ONE ROW PER UNIT. Two rows of SICKLE-01 = one line, qty 2.
    expect(order?.lines).toHaveLength(1);
    expect(order?.lines[0]?.platformSku).toBe('SICKLE-01');
    expect(order?.lines[0]?.quantity).toBe(2);
  });

  test.skip('maps machine statuses', async () => {
    const result = await lazadaAdapter.parse(loadFixture(LAZADA_FIXTURE), ctx);
    const byId = new Map(result.orders.map((order) => [order.externalOrderId, order]));

    expect(byId.get('900000000000001')?.status).toBe('delivered');
    expect(byId.get('900000000000002')?.status).toBe('confirmed');
    expect(byId.get('900000000000003')?.status).toBe('cancelled');
    expect(byId.get('900000000000004')?.status).toBe('returned');
  });

  test.skip('uses paidPrice and the seller discount, not the platform subsidy', async () => {
    const result = await lazadaAdapter.parse(loadFixture(LAZADA_FIXTURE), ctx);
    const order = result.orders.find((o) => o.externalOrderId === '900000000000001');

    expect(order?.lines[0]?.unitPrice).toBe(satang(25_900));
    expect(order?.lines[0]?.discount).toBe(satang(2_000));
  });
});
