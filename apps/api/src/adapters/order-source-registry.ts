/**
 * Adapter registry seam.
 *
 * `packages/adapters` owns the Shopee / Lazada / TikTok file parsers. It is
 * built by another agent, so the API depends on the PORT from @stockhub/core
 * and resolves the concrete list here - one file to edit when the package is in.
 *
 * NEXT DEVELOPER:
 *   import { ORDER_SOURCE_ADAPTERS } from '@stockhub/adapters';
 *   export const adapters = (): readonly OrderSourceAdapter[] => ORDER_SOURCE_ADAPTERS;
 *
 * Detection contract (already relied on by import-service.ts): ask every
 * adapter, keep the highest confidence above MIN_CONFIDENCE, and report the
 * winner's `reason` to the user so a wrong guess is debuggable from the UI.
 */

import { StockHubError } from '@stockhub/core';
import type { DetectionResult, OrderSourceAdapter, RawImportFile } from '@stockhub/core';

/** Below this we refuse the file instead of guessing wrong and moving stock. */
export const MIN_CONFIDENCE = 0.5;

/** TODO(template): return the adapters exported by @stockhub/adapters. */
export const adapters = (): readonly OrderSourceAdapter[] => [];

export interface DetectedAdapter {
  adapter: OrderSourceAdapter;
  detection: DetectionResult;
}

/**
 * Pick the adapter for an uploaded file.
 *
 * Header sniffing only - `detect()` must never parse the whole file, because
 * this runs inside the upload request.
 */
export const detectAdapter = async (file: RawImportFile): Promise<DetectedAdapter> => {
  const candidates = await Promise.all(
    adapters().map(async (adapter) => ({ adapter, detection: await adapter.detect(file) })),
  );

  const best = candidates
    .filter((candidate) => candidate.detection.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.detection.confidence - a.detection.confidence)[0];

  if (!best) {
    throw new StockHubError('validation_error', 'ไม่รู้จักรูปแบบไฟล์นี้ กรุณาเลือกช่องทางการขายเอง', {
      fileName: file.fileName,
      tried: candidates.map((c) => c.adapter.kind),
    });
  }
  return best;
};

/** Explicit override when the user picked the channel in the UI. */
export const adapterForKind = (kind: string): OrderSourceAdapter => {
  const found = adapters().find((adapter) => adapter.kind === kind);
  if (!found) {
    throw new StockHubError('validation_error', `No import adapter for channel kind "${kind}"`);
  }
  return found;
};
