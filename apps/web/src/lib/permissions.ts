/**
 * Pure permission helpers for the web app.
 *
 * This module is deliberately free of React and of '@/' aliases: it is imported
 * by component tests, and `bun test` from the repo root resolves files without
 * the web app's tsconfig path mapping. Keep it that way.
 */

import type { Permission, Role } from '@stockhub/core';
import { can } from '@stockhub/core';

/**
 * Does this role hold this permission? The same can() table the API uses, so
 * the UI can never invent its own rules.
 */
export const isVisible = (role: Role, permission: Permission): boolean => can(role, permission);
