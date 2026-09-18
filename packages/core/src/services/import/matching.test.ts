import { describe, expect, test } from 'bun:test';
import { asChannelId, asVariantId } from '../../domain/ids';
import { type MatchCandidate, type MatchIndex, matchSku, skuSimilarity } from './matching';

const lazadaMain = asChannelId('0d000000-0000-4000-8000-000000000003');
const shopeeMain = asChannelId('0d000000-0000-4000-8000-000000000001');

const candidate = (variantId: string, sku: string, name: string): MatchCandidate => ({
  variantId: asVariantId(variantId),
  sku,
  name,
});

// Hand-built index mirroring the seed's interesting shapes: exact SKUs, one
// listing whose platform SKU is nothing like its internal SKU, and one listing
// on another channel that collides with an internal SKU to prove precedence.
const bySku = new Map<string, MatchCandidate>([
  ['HOE-001', candidate('var_hoe', 'HOE-001', 'จอบขุดดิน ด้ามไม้')],
  ['HOS-20M', candidate('var_hose', 'HOS-20M', 'สายยางรดน้ำ 20 เมตร')],
  ['SPR-16L', candidate('var_sprayer', 'SPR-16L', 'ถังพ่นยา 16 ลิตร')],
  ['GLV-01', candidate('var_glove', 'GLV-01', 'ถุงมือทำสวน')],
]);

// byNormalisedSku is derived from bySku in production (buildMatchIndex); the
// test derives it the same way so the two maps cannot drift.
const byNormalisedSku = new Map<string, MatchCandidate[]>();
for (const c of bySku.values()) {
  const key = c.sku
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
  byNormalisedSku.set(key, [...(byNormalisedSku.get(key) ?? []), c]);
}

const index: MatchIndex = {
  listingMap: new Map([
    [`${lazadaMain}::SHPHOS20M`, asVariantId('var_hose')],
    [`${shopeeMain}::HOE001`, asVariantId('var_hose')],
  ]),
  bySku,
  byNormalisedSku,
};

describe('matchSku', () => {
  test('a listing beats an exact SKU match', () => {
    const result = matchSku(shopeeMain, 'HOE-001', index);
    expect(result.source).toBe('listing_map');
    expect(result.variantId).toBe(asVariantId('var_hose'));
    expect(result.suggestions).toHaveLength(0);
  });

  test('an exact internal SKU matches directly', () => {
    const result = matchSku(lazadaMain, 'HOE-001', index);
    expect(result.source).toBe('sku_exact');
    expect(result.variantId).toBe(asVariantId('var_hoe'));
  });

  test('a differently formatted SKU matches after normalisation', () => {
    const result = matchSku(lazadaMain, 'hoe_001', index);
    expect(result.source).toBe('sku_normalised');
    expect(result.variantId).toBe(asVariantId('var_hoe'));
  });

  test('two variants sharing a normalised form stay unmatched with both suggested at score 1', () => {
    const ambiguous: MatchIndex = {
      listingMap: new Map(),
      bySku: new Map([
        ['FRT-50', candidate('var_fert50', 'FRT-50', 'ปุ๋ย 50 กก.')],
        ['FRT_50', candidate('var_fert25', 'FRT_50', 'ปุ๋ย 25 กก.')],
      ]),
      byNormalisedSku: new Map([
        [
          'FRT50',
          [
            candidate('var_fert50', 'FRT-50', 'ปุ๋ย 50 กก.'),
            candidate('var_fert25', 'FRT_50', 'ปุ๋ย 25 กก.'),
          ],
        ],
      ]),
    };
    const result = matchSku(lazadaMain, 'FRT 50', ambiguous);
    expect(result.source).toBe('unmatched');
    expect(result.variantId).toBeUndefined();
    expect(result.suggestions).toHaveLength(2);
    for (const suggestion of result.suggestions) expect(suggestion.score).toBe(1);
  });

  test('a platform-prefixed SKU stays unmatched but ranks the right variant first', () => {
    const result = matchSku(lazadaMain, 'LZD-SPR16', index);
    expect(result.source).toBe('unmatched');
    expect(result.suggestions[0]?.sku).toBe('SPR-16L');
  });

  test('a SKU nothing resembles gets no suggestions', () => {
    const result = matchSku(lazadaMain, 'TOTALLY-DIFFERENT', index);
    expect(result.source).toBe('unmatched');
    expect(result.suggestions).toHaveLength(0);
  });
});

describe('skuSimilarity', () => {
  test('is 1 when two SKUs normalise to the same string', () => {
    expect(skuSimilarity('HOE-001', 'hoe001')).toBe(1);
  });
});
