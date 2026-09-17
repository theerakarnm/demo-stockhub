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
 * TODO(template): implement matchSku.
 */

import type { MatchSource } from '../../domain/enums';
import type { ChannelId, VariantId } from '../../domain/ids';
import { NotImplementedError } from '../../errors';

export interface MatchCandidate {
  variantId: VariantId;
  sku: string;
  name: string;
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

export const matchSku = (
  _channelId: ChannelId,
  _platformSku: string,
  _index: MatchIndex,
): MatchResult => {
  throw new NotImplementedError('matchSku');
};
