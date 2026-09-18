import { describe, expect, test } from 'bun:test';
import { asChannelId, asVariantId } from '../../domain/ids';
import type { VariantId } from '../../domain/ids';
import type { MatchCandidate, MatchIndex } from './matching';
import { listingKey, matchSku, normaliseSku, skuSimilarity } from './matching';

const channel = asChannelId('0d000000-0000-4000-8000-000000000001');

const candidate = (id: string, sku: string, name: string): MatchCandidate => ({
  variantId: asVariantId(id),
  sku,
  name,
});

const HOE = candidate('0f000000-0000-4000-8000-000000000001', 'HOE-001', 'Garden Hoe');
const HOSE = candidate('0f000000-0000-4000-8000-000000000007', 'HOS-20M', 'Water Hose 20m');
// Same product typed twice with different separator habits: both normalise to HOS20M.
const HOSE_DUPLICATE = candidate(
  '0f000000-0000-4000-8000-000000000077',
  'HOS20M',
  'Water Hose 20m',
);
const SPRAYER = candidate(
  '0f000000-0000-4000-8000-000000000013',
  'SPR-16L',
  'Knapsack Sprayer 16L',
);
const GLOVE = candidate('0f000000-0000-4000-8000-000000000014', 'GLV-01', 'Garden Glove');

const bySku = new Map<string, MatchCandidate>([
  [HOE.sku, HOE],
  [HOSE.sku, HOSE],
  [HOSE_DUPLICATE.sku, HOSE_DUPLICATE],
  [SPRAYER.sku, SPRAYER],
  [GLOVE.sku, GLOVE],
]);

// normaliseSku(internal SKU) -> variants sharing that normalised form, derived
// exactly like catalog-repo.buildMatchIndex builds it from database rows.
const byNormalisedSku = new Map<string, MatchCandidate[]>();
for (const c of bySku.values()) {
  const key = normaliseSku(c.sku);
  byNormalisedSku.set(key, [...(byNormalisedSku.get(key) ?? []), c]);
}

const listingMap = new Map<string, VariantId>([
  [listingKey(channel, 'shp hos 20m'), HOSE.variantId],
  [listingKey(channel, 'GLV-01'), HOSE.variantId],
]);

const index: MatchIndex = {
  // A human once decided GLV-01 on this channel is actually the hose.
  listingMap,
  bySku,
  byNormalisedSku,
};

describe('matchSku', () => {
  test('listing_map wins over an exact SKU hit', () => {
    const result = matchSku(channel, 'GLV-01', index);
    expect(result.source).toBe('listing_map');
    expect(result.variantId).toBe(HOSE.variantId);
    expect(result.suggestions).toEqual([]);
  });

  test('an exact internal SKU matches by sku_exact', () => {
    const result = matchSku(channel, ' HOE-001 ', index);
    expect(result.source).toBe('sku_exact');
    expect(result.variantId).toBe(HOE.variantId);
    expect(result.suggestions).toEqual([]);
  });

  test('a separator-noise SKU matches by sku_normalised', () => {
    const result = matchSku(channel, 'hoe_001', index);
    expect(result.source).toBe('sku_normalised');
    expect(result.variantId).toBe(HOE.variantId);
    expect(result.suggestions).toEqual([]);
  });

  test('two variants sharing a normalised form stay unmatched with both at score 1', () => {
    const result = matchSku(channel, 'h os 20m', index);
    expect(result.source).toBe('unmatched');
    expect(result.variantId).toBeUndefined();
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.map((c) => c.sku)).toEqual(['HOS-20M', 'HOS20M']);
    expect(result.suggestions.every((c) => c.score === 1)).toBe(true);
  });

  test('a fuzzy platform SKU gets SPR-16L ranked first', () => {
    const result = matchSku(channel, 'LZD-SPR16', index);
    expect(result.source).toBe('unmatched');
    expect(result.suggestions[0]?.sku).toBe('SPR-16L');
    expect(result.suggestions[0]?.score).toBeGreaterThan(0.3);
  });

  test('a completely different SKU gets no suggestions', () => {
    const result = matchSku(channel, 'TOTALLY-DIFFERENT', index);
    expect(result.source).toBe('unmatched');
    expect(result.suggestions).toEqual([]);
  });
});

describe('skuSimilarity', () => {
  test('returns 1 for the same normalised form', () => {
    expect(skuSimilarity('HOE-001', 'hoe001')).toBe(1);
  });
});
