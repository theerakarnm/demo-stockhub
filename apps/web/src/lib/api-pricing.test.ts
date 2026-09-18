/**
 * Pure tests for the pricing/customer mocks behind pricingApi and customersApi.
 *
 * The api modules run with DEMO_MODE on in tests, so every call below is
 * answered by mock-pricing.ts - no network, no database.
 */

import { describe, expect, test } from 'bun:test';
import { customersApi, pricingApi } from './api-pricing';

describe('pricing mocks', () => {
  test('resolve for a wholesale customer returns the tier price', async () => {
    const rows = await pricingApi.resolve(['var_hoe_4h'], { customerId: 'cus_farm_shop_a' });
    expect(rows[0]?.priceSource).toBe('tier');
    // Mock wholesale is the seed's 90% rule: 185.00 -> 166.50.
    expect(rows[0]?.price).toBe(16_650);
  });

  test('resolve for a customer without a tier falls back to the selling price', async () => {
    const rows = await pricingApi.resolve(['var_hoe_4h'], { customerId: 'cus_walk_in' });
    expect(rows[0]?.priceSource).toBe('selling_price');
    expect(rows[0]?.price).toBe(18_500);
  });

  test('customersApi mock list filters by q', async () => {
    const all = await customersApi.list();
    expect(all).toHaveLength(5);
    const filtered = await customersApi.list('สวน');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe('ร้านสวนเกษตรดี');
  });
});
