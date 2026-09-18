/**
 * Pure tests for the pricing client against its demo mocks. No backend, no
 * network: DEMO_MODE is on in tests, so demo() answers from mock-pricing.
 */

import { describe, expect, test } from 'bun:test';
import { customersApi, pricingApi } from './api-pricing';
import { MOCK_CUSTOMERS, MOCK_MATRIX } from './mock-pricing';

describe('pricing client (demo mocks)', () => {
  test('resolve for a wholesale customer answers the tier price', async () => {
    const variantIds = MOCK_MATRIX.map((row) => row.variantId).slice(0, 3);
    const rows = await pricingApi.resolve(variantIds, { customerId: 'cus_farm_dee' });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.priceSource).toBe('tier');
      expect(row.priceTierId).toBe('tier_wholesale');
    }
    // The hoe sells at 185.00; wholesale = 90% rounded to a whole baht.
    const hoe = MOCK_MATRIX.find((row) => row.variantId === variantIds[0]);
    expect(rows[0]?.price).toBe(hoe ? Math.round((hoe.sellingPrice * 0.9) / 100) * 100 : -1);
  });

  test('resolve for a customer without a tier answers the standard price', async () => {
    const variantIds = MOCK_MATRIX.map((row) => row.variantId).slice(0, 2);
    const rows = await pricingApi.resolve(variantIds, { customerId: 'cus_walk_in' });
    for (const row of rows) {
      expect(row.priceSource).toBe('selling_price');
      expect('priceTierId' in row).toBe(false);
    }
    const source = MOCK_MATRIX.find((row) => row.variantId === variantIds[0]);
    expect(rows[0]?.price).toBe(source?.sellingPrice);
  });

  test('the customer list filters by Thai name and by phone', async () => {
    const all = await customersApi.list();
    expect(all.length).toBeGreaterThanOrEqual(MOCK_CUSTOMERS.length);

    const byName = await customersApi.list('สหกรณ์');
    expect(byName).toHaveLength(1);
    expect(byName[0]?.name).toBe('สหกรณ์การเกษตรหนองบัว');

    const byPhone = await customersApi.list('082');
    expect(byName).toHaveLength(1);
    expect(byPhone[0]?.id).toBe('cus_baan_na');
  });
});
