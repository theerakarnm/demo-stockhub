import { describe, expect, test } from 'bun:test';
import { withQuery } from './api-core';

describe('withQuery', () => {
  test('keeps only the values a server can parse', () => {
    expect(withQuery('/x', { a: 1, b: undefined, c: '' })).toBe('/x?a=1');
  });

  test('returns the bare path when there is no query', () => {
    expect(withQuery('/x')).toBe('/x');
  });
});
