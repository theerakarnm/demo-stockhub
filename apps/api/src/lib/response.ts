/**
 * THE SINGLE CHOKE POINT FOR COST HIDING.
 *
 * Every successful JSON response goes through `ok()` or `paginated()`. Both run
 * the payload through redactForRole(), which drops every key of every policy
 * the caller's role lacks (FIELD_POLICIES in packages/core/src/rbac.ts). The
 * same middleware rewrites any response a handler escapes with raw c.json(),
 * so the two layers cannot disagree. Consequences to respect:
 *
 *   - A route handler may build the full object with unit costs in it. It does
 *     NOT need to know who is calling. That is deliberate: a developer who
 *     forgets the rule still ships a safe payload.
 *   - Still return through `ok()` / `paginated()`: they type the envelope and
 *     keep one shape for every route, even though redaction itself no longer
 *     depends on them.
 *   - Cost hiding is field level. Blocking a whole endpoint (COGS report) is a
 *     permission check, see middleware/require-permission.ts.
 */

import { can, redactForRole } from '@stockhub/core';
import type { Context } from 'hono';
import type { AppEnv } from '../types/app';
import type { Page } from '../types/contract';

/** True when the caller is allowed to see money-in numbers. */
export const canSeeCost = (c: Context<AppEnv>): boolean => can(c.get('auth').role, 'cost:read');

/**
 * Apply the role's cost visibility to any payload shape.
 * Exported for unit tests and for streaming responses that cannot use ok().
 */
export const applyCostVisibility = <T>(c: Context<AppEnv>, data: T): T =>
  redactForRole(c.get('auth').role, data);

/** Success response. Use this instead of c.json() in every route. */
export const ok = <T>(c: Context<AppEnv>, data: T, status: 200 | 201 = 200) =>
  c.json(applyCostVisibility(c, data) as T, status);

/**
 * Cursor paginated list response: { items, nextCursor }.
 *
 * Cursor and not offset because inventory and movement lists are append-heavy;
 * an offset page shifts under the user while a cursor stays stable.
 */
export const paginated = <T>(c: Context<AppEnv>, items: T[], nextCursor: string | null = null) =>
  ok<Page<T>>(c, { items, nextCursor });
