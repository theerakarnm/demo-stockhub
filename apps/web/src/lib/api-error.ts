/**
 * ApiError lives in its own module so mock-data.ts can throw it without
 * importing api-client.ts (which imports mock-data.ts).
 */

import type { ApiErrorCode } from './api-types';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True for the template gaps the API answers with 501. */
  get isNotImplemented(): boolean {
    return this.code === 'not_implemented';
  }

  get isForbidden(): boolean {
    return this.code === 'forbidden';
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;

/** HTTP status for a StockHubError code. Mirrors the mapping used by the API. */
export const statusForCode = (code: ApiErrorCode): number => {
  switch (code) {
    case 'not_implemented':
      return 501;
    case 'forbidden':
      return 403;
    case 'unmatched_sku':
      return 422;
    case 'insufficient_stock':
      return 409;
    case 'not_found':
      return 404;
    case 'validation_error':
      return 400;
    default:
      return 500;
  }
};
