import { describe, expect, test } from 'bun:test';
import { mockCatalogApi } from './mock-catalog';

describe('mockCatalogApi', () => {
  test("search('hoe') returns the hoe row, matching sku case-insensitively", async () => {
    const rows = await mockCatalogApi.search('hoe');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBe('HOE-001');
  });

  test("search('zzz') finds nothing", async () => {
    expect(await mockCatalogApi.search('zzz')).toEqual([]);
  });

  test('saveListing echoes the input and reports one line updated', async () => {
    const result = await mockCatalogApi.saveListing({
      channelId: 'ch_lazada_main',
      platformSku: 'LZD-NEW-HAT-XL',
      variantId: 'var_hat',
    });
    expect(result.variantId).toBe('var_hat');
    expect(result.platformSku).toBe('LZD-NEW-HAT-XL');
    expect(result.channelId).toBe('ch_lazada_main');
    expect(result.linesUpdated).toBe(1);
  });
});
