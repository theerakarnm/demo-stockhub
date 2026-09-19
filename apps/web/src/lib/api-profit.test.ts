/**
 * Pure tests for the profit report and fee mocks behind the flat api object.
 *
 * The api modules run with DEMO_MODE on in tests, so every call below is
 * answered by mock-data.ts - no network, no database.
 */

import { describe, expect, test } from 'bun:test';
import { api } from './api-client';
import { ApiError } from './api-error';
import { DEFAULT_ROLE, setDemoIdentity } from './demo-identity';

/** Wide enough to include every fixture bill regardless of the run date. */
const WHOLE_WINDOW = { from: '2000-01-01', to: '2999-12-31' };

/** Assert the call rejects with the API's standard forbidden error. */
const expectForbidden = async (call: Promise<unknown>): Promise<void> => {
  let caught: unknown;
  try {
    await call;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ApiError);
  if (caught instanceof ApiError) expect(caught.code).toBe('forbidden');
};

describe('profit mocks', () => {
  test('totals equal the summed rows', async () => {
    const report = await api.getProfitReport(WHOLE_WINDOW);
    expect(report.rows).toHaveLength(4);
    expect(report.totals.orders).toBe(report.rows.length);
    expect(report.totals.revenue).toBe(report.rows.reduce((sum, row) => sum + row.revenue, 0));
    expect(report.totals.fee).toBe(report.rows.reduce((sum, row) => sum + (row.fee ?? 0), 0));
    expect(report.totals.cogs).toBe(report.rows.reduce((sum, row) => sum + (row.cogs ?? 0), 0));
    expect(report.totals.profit).toBe(report.rows.reduce((sum, row) => sum + (row.profit ?? 0), 0));
    expect(report.totals.profit).toBe(
      report.channelRows.reduce((sum, row) => sum + (row.profit ?? 0), 0),
    );

    // Sales-side absence, pinned on the report: every column of this endpoint
    // is cost, so sales gets the same 403 the live backend answers with.
    setDemoIdentity({ role: 'sales' });
    await expectForbidden(api.getProfitReport(WHOLE_WINDOW));
    setDemoIdentity({ role: DEFAULT_ROLE });
  });

  test('the fully returned order contributes all zeros', async () => {
    const report = await api.getProfitReport(WHOLE_WINDOW);
    const returned = report.rows.find((row) => row.status === 'returned');
    expect(returned).toBeDefined();
    expect(returned?.unitsReturned).toBe(returned?.unitsSold);
    expect(returned?.revenue).toBe(0);
    expect(returned?.fee).toBe(0);
    expect(returned?.cogs).toBe(0);
    expect(returned?.profit).toBe(0);
  });

  test('the channel filter drops other channels', async () => {
    const all = await api.getProfitReport(WHOLE_WINDOW);
    expect(all.channelRows).toHaveLength(2);

    const shopeeOnly = await api.getProfitReport({ ...WHOLE_WINDOW, channelId: 'ch_shopee_main' });
    expect(shopeeOnly.rows.every((row) => row.channelId === 'ch_shopee_main')).toBe(true);
    expect(shopeeOnly.channelRows.map((row) => row.channelId)).toEqual(['ch_shopee_main']);
    expect(shopeeOnly.rows).toHaveLength(all.rows.length - 1);
  });

  test('setOrderFee echoes feeSource manual', async () => {
    const orderId = 'ord_240517ABCD1234';
    const updated = await api.setOrderFee(orderId, 12_345);
    expect(updated.platformFee).toBe(12_345);
    expect(updated.feeSource).toBe('manual');

    // The write sticks: a re-read of the same bill carries the new fee.
    const reread = await api.getOrder(orderId);
    expect(reread.platformFee).toBe(12_345);
    expect(reread.feeSource).toBe('manual');

    // Sales-side absence, pinned on the write: no cost:write, same 403 as live.
    setDemoIdentity({ role: 'sales' });
    await expectForbidden(api.setOrderFee(orderId, 1));
    setDemoIdentity({ role: DEFAULT_ROLE });
  });
});
