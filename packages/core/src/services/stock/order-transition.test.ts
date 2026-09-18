/**
 * Executable specification for the order status -> stock effect table.
 *
 * The six cases are the ones the cancel / return flows and the import applier
 * rely on: a shipped sale restores on cancel, a delivered sale restores on
 * return, a pending order never moved stock, and a duplicate or backwards
 * transition is refused instead of silently reapplied.
 *
 * Run: bun test packages/core/src/services/stock/order-transition.test.ts
 */

import { describe, expect, test } from 'bun:test';
import { stockEffectOf } from './order-transition';

describe('stockEffectOf', () => {
  test('pending -> shipped consumes stock', () => {
    expect(stockEffectOf('pending', 'shipped', false)).toBe('consume');
  });

  test('shipped -> cancelled restores the original slices when stock moved', () => {
    expect(stockEffectOf('shipped', 'cancelled', true)).toBe('restore');
  });

  test('delivered -> returned restores the original slices when stock moved', () => {
    expect(stockEffectOf('delivered', 'returned', true)).toBe('restore');
  });

  test('pending -> cancelled moves no stock, only the status', () => {
    expect(stockEffectOf('pending', 'cancelled', false)).toBe('none');
  });

  test('cancelled -> shipped is invalid, not a second consume', () => {
    expect(stockEffectOf('cancelled', 'shipped', true)).toBe('invalid');
  });

  test('shipped -> cancelled with nothing moved is a no-op', () => {
    expect(stockEffectOf('shipped', 'cancelled', false)).toBe('none');
  });
});
