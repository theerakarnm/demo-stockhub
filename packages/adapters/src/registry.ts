/**
 * The adapter registry - the one place that knows which marketplaces exist.
 *
 * apps/api asks this module "who can read this file?" and then "parse it".
 * It never imports a concrete adapter, so adding TikTok Live, Line Shopping or
 * a Shopee OpenAPI adapter is a one-line change HERE and nowhere else.
 *
 * HOW TO ADD A MARKETPLACE: see README.md ("Add a new marketplace in 4 steps").
 */

import {
  type DetectionResult,
  type ImportableChannelKind,
  type OrderSourceAdapter,
  type RawImportFile,
  StockHubError,
} from '@stockhub/core';
import { lazadaAdapter } from './lazada/adapter';
import { shopeeAdapter } from './shopee/adapter';
import { tiktokAdapter } from './tiktok/adapter';

/**
 * Every adapter, in priority order. Order only matters as a tie-break, because
 * detection is score-based.
 *
 * To swap the Shopee FILE adapter for a Shopee API adapter, change this one
 * line to `shopeeApiAdapter`. Nothing else in the monorepo has to change - both
 * satisfy OrderSourceAdapter.
 */
export const adapters: readonly OrderSourceAdapter[] = [
  shopeeAdapter,
  lazadaAdapter,
  tiktokAdapter,
];

const byKind: Readonly<Record<ImportableChannelKind, OrderSourceAdapter>> = {
  shopee: shopeeAdapter,
  lazada: lazadaAdapter,
  tiktok: tiktokAdapter,
};

/** Throws rather than returning undefined: an unknown kind is a bug, not input. */
export const getAdapter = (kind: ImportableChannelKind): OrderSourceAdapter => {
  const adapter = byKind[kind];
  if (adapter === undefined) {
    throw new StockHubError('unknown_channel_kind', `No adapter registered for "${kind}"`, {
      kind,
    });
  }
  return adapter;
};

/**
 * Minimum confidence before we are willing to name a platform.
 *
 * WHY 0.6:
 *   scoreSignature() gives at most 0.55 for "has all the generic columns"
 *   (Order ID / Status / Seller SKU / Quantity - which Shopee and TikTok
 *   share) and up to 0.45 more for platform-unique fingerprint headers.
 *   A threshold of 0.6 therefore means: shape alone is never enough, the file
 *   must also carry at least one header that only that platform uses.
 *   Lower it and a Shopee file starts being detected as TikTok. Raise it above
 *   0.75 and a seller who deselected columns in the export dialog gets "ไม่รู้จัก
 *   ไฟล์นี้" on a perfectly good file.
 */
export const DETECTION_THRESHOLD = 0.6;

/**
 * Scores the file against every adapter. Useful on its own for the import
 * screen: showing the runner-up ("Shopee 0.31") explains a wrong guess far
 * better than a generic error.
 *
 * Sorted by confidence descending; ties keep registry order.
 */
export const detectAll = async (file: RawImportFile): Promise<DetectionResult[]> => {
  const results = await Promise.all(adapters.map((adapter) => adapter.detect(file)));
  return results
    .map((result, i) => ({ result, i }))
    .sort((a, b) => b.result.confidence - a.result.confidence || a.i - b.i)
    .map(({ result }) => result);
};

/**
 * Picks the adapter for an uploaded file.
 *
 * Returns `null` when nothing scores above DETECTION_THRESHOLD - the import
 * screen then asks the user to choose the channel manually, which is also the
 * escape hatch for a brand new export format.
 */
export const detectAdapter = async (file: RawImportFile): Promise<DetectionResult | null> => {
  const ranked = await detectAll(file);
  const best = ranked[0];
  if (best === undefined || best.confidence < DETECTION_THRESHOLD) return null;
  return best;
};
