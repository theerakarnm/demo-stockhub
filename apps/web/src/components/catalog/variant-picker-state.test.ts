import { describe, expect, test } from 'bun:test';
import { pickerReducer } from './variant-picker-state';

describe('pickerReducer', () => {
  test('move +1 from the last item wraps back to 0', () => {
    const state = { open: true, highlighted: 2, query: 'hoe' };
    const next = pickerReducer(state, { type: 'move', delta: 1, count: 3 });
    expect(next.highlighted).toBe(0);
    expect(next.open).toBe(true);
    expect(next.query).toBe('hoe');
  });

  test('type reopens the list and resets the highlight to the top', () => {
    const state = { open: false, highlighted: 4, query: 'ho' };
    const next = pickerReducer(state, { type: 'type', query: 'hoe' });
    expect(next).toEqual({ open: true, highlighted: 0, query: 'hoe' });
  });

  test('close keeps the query so reopening can refine it', () => {
    const state = { open: true, highlighted: 1, query: 'hoe' };
    const next = pickerReducer(state, { type: 'close' });
    expect(next.open).toBe(false);
    expect(next.query).toBe('hoe');
    expect(next.highlighted).toBe(1);
  });
});
