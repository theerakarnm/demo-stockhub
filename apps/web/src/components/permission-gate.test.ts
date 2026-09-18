/**
 * Tests for the pure visibility helper behind <PermissionGate>.
 *
 * The helper is re-exported next to the component, but this file imports it
 * from src/lib/permissions.ts: that module has no '@/' aliases in its graph,
 * and `bun test` from the repo root resolves files without the web app's
 * tsconfig path mapping. Only the helper is tested, on purpose: rendering the
 * component would need a RoleProvider wrapper for one boolean branch, and the
 * component itself is two lines around this function.
 */

import { describe, expect, test } from 'bun:test';
import { isVisible } from '../lib/permissions';

describe('isVisible', () => {
  test('sales may see tier prices', () => {
    expect(isVisible('sales', 'price_tier:read')).toBe(true);
  });

  test('stock_staff may not see tier prices', () => {
    expect(isVisible('stock_staff', 'price_tier:read')).toBe(false);
  });
});
