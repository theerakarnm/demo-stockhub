/**
 * zod validation that respects the error contract.
 *
 * WHY NOT PLAIN zValidator: @hono/zod-validator answers a bad request with its
 * own `{ success: false, error }` body, which is not the documented envelope.
 * The hook below rethrows the ZodError so middleware/error.ts formats it as
 * `{ error: { code: 'validation_error', message, details.issues } }` with a 400.
 *
 * Use `validate('query' | 'json' | 'param' | 'header', schema)` in every route.
 */

import { zValidator } from '@hono/zod-validator';
import type { Env as HonoEnv, ValidationTargets } from 'hono';
import type { ZodSchema } from 'zod';
import type { AppEnv } from '../types/app';

export const validate = <
  T extends ZodSchema,
  Target extends keyof ValidationTargets,
  E extends HonoEnv = AppEnv,
  P extends string = string,
>(
  target: Target,
  schema: T,
) =>
  zValidator<T, Target, E, P>(target, schema, (result) => {
    if (!result.success) throw result.error;
  });
