/**
 * Maps a platform SKU from an export file onto an internal variant.
 *
 * Match order (first hit wins):
 *   1. listing_map      - an explicit channel_listings row. Always trust this.
 *   2. sku_exact        - platform SKU === variant SKU
 *   3. sku_normalised   - both sides upper-cased, spaces/dashes stripped
 *   4. unmatched        - the user resolves it on the import preview screen,
 *                         and the choice is saved as a listing_map row so the
 *                         next import matches automatically.
 *
 * The unmatched step never guesses: when normalisation is ambiguous or misses,
 * the matcher hands back a ranked suggestion list and the user decides.
 */

import type { MatchSource } from '../../domain/enums';
import type { ChannelId, VariantId } from '../../domain/ids';

export interface MatchCandidate {
  variantId: VariantId;
  sku: string;
  name: string;
  /** Similarity to the platform SKU being matched, 0 (nothing) to 1 (identical). */
  score?: number;
}

export interface MatchResult {
  variantId?: VariantId;
  source: MatchSource;
  /** Shown on the preview screen when source is 'unmatched'. */
  suggestions: MatchCandidate[];
}

export interface MatchIndex {
  /** channelId + platform SKU -> variant. Built from channel_listings. */
  listingMap: ReadonlyMap<string, VariantId>;
  /** Internal SKU -> variant. */
  bySku: ReadonlyMap<string, MatchCandidate>;
  /** normaliseSku(internal SKU) -> variants sharing that normalised form. */
  byNormalisedSku: ReadonlyMap<string, MatchCandidate[]>;
}

export const normaliseSku = (sku: string): string =>
  sku
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');

export const listingKey = (channelId: ChannelId, platformSku: string): string =>
  `${channelId}::${normaliseSku(platformSku)}`;

/** Adjacent character pairs of the normalised SKU - the unit of Dice similarity. */
const bigrams = (s: string): Set<string> => {
  const n = normaliseSku(s);
  const out = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
};

/**
 * Pure similarity between two SKUs, 0 to 1.
 *
 * Identity first, then a cheap substring shortcut for the common
 * 'LZD-SPR16' vs 'SPR-16L' shape, then a Dice coefficient over bigrams so
 * typos and prefixes still rank high.
 */
export const skuSimilarity = (a: string, b: string): number => {
  const na = normaliseSku(a);
  const nb = normaliseSku(b);
  if (na === nb) return 1;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return 0.8;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  if (ba.size === 0 || bb.size === 0) return 0;
  let shared = 0;
  for (const g of ba) if (bb.has(g)) shared++;
  return (2 * shared) / (ba.size + bb.size);
};

/**
 * Ranked candidates for a platform SKU that no listing or SKU rule matched.
 * Name hits count at 0.6 weight because sellers reword product names freely.
 * The 0.3 floor keeps the suggestion list short and honest.
 */
export const suggestCandidates = (
  platformSku: string,
  index: MatchIndex,
  limit: number,
): MatchCandidate[] =>
  [...index.bySku.values()]
    .map((c) => ({
      ...c,
      score: Math.max(skuSimilarity(platformSku, c.sku), skuSimilarity(platformSku, c.name) * 0.6),
    }))
    .filter((c) => (c.score ?? 0) >= 0.3)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.sku.localeCompare(b.sku))
    .slice(0, limit);

export const matchSku = (
  channelId: ChannelId,
  platformSku: string,
  index: MatchIndex,
): MatchResult => {
  const listed = index.listingMap.get(listingKey(channelId, platformSku));
  if (listed) return { variantId: listed, source: 'listing_map', suggestions: [] };

  const exact = index.bySku.get(platformSku.trim());
  if (exact) return { variantId: exact.variantId, source: 'sku_exact', suggestions: [] };

  const normalised = index.byNormalisedSku.get(normaliseSku(platformSku)) ?? [];
  const only = normalised[0];
  if (normalised.length === 1 && only)
    return { variantId: only.variantId, source: 'sku_normalised', suggestions: [] };

  // Zero or ambiguous normalised hits: never guess, hand the user a ranked list.
  return {
    source: 'unmatched',
    suggestions:
      normalised.length > 1
        ? normalised.map((c) => ({ ...c, score: 1 }))
        : suggestCandidates(platformSku, index, 5),
  };
};
