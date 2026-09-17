/**
 * Opaque cursor helpers.
 *
 * A cursor is an internal detail, so it is base64url encoded: clients cannot
 * build one by hand and we can change the payload without breaking them.
 * Payload is intentionally tiny - the sort key of the last row on the page.
 *
 * Real query usage (keyset pagination, not OFFSET):
 *   WHERE (created_at, id) < ($cursorCreatedAt, $cursorId)
 *   ORDER BY created_at DESC, id DESC
 *   LIMIT $limit + 1        -- the extra row tells you whether a next page exists
 */

import { StockHubError } from '@stockhub/core';

export interface CursorPayload {
  /** ISO timestamp of the last row on the previous page. */
  at: string;
  /** Row id, breaking ties on identical timestamps. */
  id: string;
}

const toBase64Url = (raw: string): string =>
  btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (raw: string): string => atob(raw.replace(/-/g, '+').replace(/_/g, '/'));

export const encodeCursor = (payload: CursorPayload): string =>
  toBase64Url(JSON.stringify(payload));

export const decodeCursor = (cursor: string): CursorPayload => {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(cursor));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CursorPayload).at === 'string' &&
      typeof (parsed as CursorPayload).id === 'string'
    ) {
      return parsed as CursorPayload;
    }
    throw new Error('bad shape');
  } catch {
    throw new StockHubError('validation_error', 'Malformed cursor', { cursor });
  }
};
