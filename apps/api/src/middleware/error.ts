/**
 * The only place that turns an exception into an HTTP response.
 *
 * Contract (documented in the task spec, relied on by apps/web):
 *   { error: { code, message, details? } }
 *
 * Status mapping lives in ERROR_STATUS. Add a code there when you add a new
 * StockHubError subclass in packages/core, otherwise it falls back to 500.
 */

import { StockHubError } from '@stockhub/core';
import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { AppEnv } from '../types/app';
import type { ErrorResponse } from '../types/contract';

/** StockHubError.code -> HTTP status. */
export const ERROR_STATUS: Record<string, number> = {
  not_implemented: 501,
  forbidden: 403,
  unmatched_sku: 422,
  insufficient_stock: 409,
  not_found: 404,
  validation_error: 400,
  conflict: 409,
  unauthorized: 401,
};

const body = (code: string, message: string, details?: Record<string, unknown>): ErrorResponse => ({
  error: { code, message, ...(details ? { details } : {}) },
});

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  // 1. Domain errors carry their own machine code.
  if (err instanceof StockHubError) {
    const status = ERROR_STATUS[err.code] ?? 500;
    return c.json(body(err.code, err.message, err.details), status as 500);
  }

  // 2. Zod validation failures from @hono/zod-validator or a manual parse.
  if (err instanceof ZodError) {
    return c.json(
      body('validation_error', 'Request validation failed', { issues: err.issues }),
      400,
    );
  }

  // 3. Hono's own 404 / abort helpers.
  if (err instanceof HTTPException) {
    const code = err.status === 404 ? 'not_found' : 'http_error';
    return c.json(body(code, err.message), err.status);
  }

  // 4. Anything else is a bug. Log it with the request id, return no internals.
  console.error('[unhandled]', c.get('requestId'), err);
  return c.json(body('internal_error', 'Unexpected server error'), 500);
};

/** Handler for an unknown path, so 404 also follows the error envelope. */
export const notFoundHandler = (c: Context<AppEnv>) =>
  c.json(body('not_found', `No route for ${c.req.method} ${c.req.path}`), 404);
