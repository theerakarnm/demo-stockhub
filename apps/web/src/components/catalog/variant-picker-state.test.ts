import { describe, expect, test } from 'bun:test';
import { pickerReducer } from './variant-picker-state';
import type { PickerState } from './variant-picker-state';

const state = (overrides: Partial<PickerState>): PickerState => ({
  open: false,
  highlighted: 0,
  query: '',
  ...overrides,
});

describe('pickerReducer', () => {
  test('move +1 from the last item wraps back to the first', () => {
    const next = pickerReducer(state({ open: true, highlighted: 2, query: 'จอบ' }), {
      type: 'move',
      delta: 1,
      count: 3,
    });
    expect(next).toEqual(state({ open: true, highlighted: 0, query: 'จอบ' }));
  });

  test('type reopens the list and resets the highlight to the top', () => {
    const next = pickerReducer(state({ open: false, highlighted: 2, query: 'เก่า' }), {
      type: 'type',
      query: 'จอบ',
    });
    expect(next).toEqual(state({ open: true, highlighted: 0, query: 'จอบ' }));
  });

  test('close hides the list but keeps the typed query', () => {
    const next = pickerReducer(state({ open: true, highlighted: 1, query: 'จอบ' }), {
      type: 'close',
    });
    expect(next.open).toBe(false);
    expect(next.query).toBe('จอบ');
  });
});
