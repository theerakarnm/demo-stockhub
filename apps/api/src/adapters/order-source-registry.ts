/**
 * Adapter registry seam.
 *
 * The API depends only on the OrderSourceAdapter port from @stockhub/core.
 * `packages/adapters` owns the concrete Shopee / Lazada / TikTok parsers, the
 * registry list and the DETECTION_THRESHOLD (0.6), so adding a marketplace or
 * tuning detection never touches this file.
 *
 * Detection contract (already relied on by import-service.ts): the package
 * ranks every adapter and returns null when nothing clears its own threshold;
 * we turn that null into a validation_error whose `tried` list lets the UI
 * explain why no platform was confident enough.
 */

import {
  detectAdapter as detectBest,
  getAdapter,
  adapters as registered,
} from '@stockhub/adapters';
import { StockHubError } from '@stockhub/core';
import type { DetectionResult, OrderSourceAdapter, RawImportFile } from '@stockhub/core';

/** Every import adapter the package registers, in its own priority order. */
export const adapters = (): readonly OrderSourceAdapter[] => registered;

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
  const best = await detectBest(file); // null below DETECTION_THRESHOLD (0.6) - the package owns the threshold
  if (!best) {
    throw new StockHubError('validation_error', 'ไม่รู้จักรูปแบบไฟล์นี้ กรุณาเลือกช่องทางการขายเอง', {
      fileName: file.fileName,
      tried: registered.map((a) => a.kind),
    });
  }
  return { adapter: getAdapter(best.kind), detection: best };
};

/** Explicit override when the user picked the channel in the UI. */
export const adapterForKind = (kind: string): OrderSourceAdapter => {
  const found = adapters().find((adapter) => adapter.kind === kind);
  if (!found) {
    throw new StockHubError('validation_error', `No import adapter for channel kind "${kind}"`);
  }
  return found;
};
