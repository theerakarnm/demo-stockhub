// Tests for the pure permission predicate exported next to <PermissionGate>.
//
// bun test runs from the monorepo root, where apps/web's tsconfig `paths` are
// invisible; importing the real role-provider would fail to resolve its
// `@/lib/...` imports. The mock keeps the loaded module graph React-free, which
// is enough here: isVisible() only calls can() from @stockhub/core.

import { describe, expect, mock, test } from 'bun:test';

mock.module('./role-provider', () => ({
  useRole: () => ({ hasPermission: () => false }),
}));

const { isVisible } = await import('./permission-gate');

describe('isVisible', () => {
  test('sales may see tier pricing', () => {
    expect(isVisible('sales', 'price_tier:read')).toBe(true);
  });

  test('stock_staff may not see tier pricing', () => {
    expect(isVisible('stock_staff', 'price_tier:read')).toBe(false);
  });
});
