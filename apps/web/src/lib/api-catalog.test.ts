import { describe, expect, test } from 'bun:test';
import { catalogApi } from './api-catalog';
import { MOCK_CATALOG } from './mock-catalog';

describe('mockCatalogApi via catalogApi', () => {
  test('search finds the hoe by SKU fragment regardless of case', async () => {
    const rows = await catalogApi.search('hoe');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBe('HOE-001');
  });

  test('search finds nothing for gibberish', async () => {
    const rows = await catalogApi.search('zzz');
    expect(rows).toHaveLength(0);
  });

  test('saveListing echoes the chosen variant back', async () => {
    const chosen = MOCK_CATALOG[0];
    expect(chosen).toBeDefined();
    if (!chosen) return;

    const result = await catalogApi.saveListing({
      channelId: '0d000000-0000-4000-8000-000000000003',
      platformSku: 'LZD-NEW-HAT-XL',
      variantId: chosen.variantId,
    });
    expect(result.variantId).toBe(chosen.variantId);
    expect(result.linesUpdated).toBe(1);
  });
});
