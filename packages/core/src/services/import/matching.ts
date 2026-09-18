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
 * When the outcome is `unmatched` the result still carries ranked
 * `suggestions`: first every variant sharing the normalised form (score 1,
 * because one of them is almost certainly the right one), then the best
 * Dice-coefficient neighbours, so the user usually only clicks once.
 */

import type { MatchSource } from '../../domain/enums';
import type { ChannelId, VariantId } from '../../domain/ids';

export interface MatchCandidate {
  variantId: VariantId;
  sku: string;
  name: string;
  /** 0-1 similarity to the platform SKU this candidate was suggested for. */
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

const bigrams = (s: string): Set<string> => {
  const n = normaliseSku(s);
  const out = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
};

/**
 * 0-1 similarity between two SKUs.
 *
 *   1    identical after normalisation
 *   0.8  one normalised form contains the other (same product, suffix noise)
 *   else Dice coefficient over character bigrams (0-1, order sensitive)
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
  return (2 * shared) / (ba.size + bb.size); // Dice coefficient
};

/** Fallback list for the preview screen: rank every variant, keep the plausible ones. */
export const suggestCandidates = (
  platformSku: string,
  index: MatchIndex,
  limit: number,
): MatchCandidate[] =>
  [...index.bySku.values()]
    .map((c) => ({
      ...c,
      // Name similarity is damped: a shared word must not outrank a real SKU overlap.
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
  if (normalised.length === 1 && only) {
    return { variantId: only.variantId, source: 'sku_normalised', suggestions: [] };
  }
  // Zero or ambiguous normalised hits: never guess, hand the user a ranked list.
  return {
    source: 'unmatched',
    suggestions:
      normalised.length > 1
        ? normalised.map((c) => ({ ...c, score: 1 }))
        : suggestCandidates(platformSku, index, 5),
  };
};
