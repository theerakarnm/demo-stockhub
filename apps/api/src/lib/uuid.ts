/**
 * UUID syntax check for ids that reach Postgres.
 *
 * Zod's idString stays format-agnostic on purpose (ids are opaque at the
 * boundary), but a malformed id can never exist: every table key is a uuid,
 * and handing one to Postgres surfaces as a 500 instead of an honest 404.
 * Guards call this once before a query and answer not_found / validation_error
 * with the stable error envelope instead.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_RE.test(value);
