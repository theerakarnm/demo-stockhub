/**
 * Contract audit: the marker rule from Global Constraints, enforced by test.
 *
 * Every field in src/types/contract*.ts whose name is in COST_KEYS must carry
 * a `/** cost field *\/` marker, and every field in PRICE_TIER_KEYS a
 * `/** tier field *\/` marker. A contract field without its marker is a field
 * the audit cannot vouch for, which is how COST_KEYS grew out of sync with the
 * contract in Wave 1.
 *
 * The reverse direction (every marked field is a member of its set) is
 * deliberately deferred to Track P: in the sequential order the contract files
 * all exist by then, and the assertion needs every track's markers in place.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COST_KEYS, PRICE_TIER_KEYS } from '@stockhub/core';

const TYPES_DIR = join(import.meta.dir, 'types');

const contractSources = readdirSync(TYPES_DIR)
  .filter((name) => name.startsWith('contract') && name.endsWith('.ts'))
  .map((name) => readFileSync(join(TYPES_DIR, name), 'utf8'));

/** Marker comment, then the same line's field name with its optional `?`. */
const COST_MARKER = /\/\*\*\s*cost field[^*]*\*\/\s*\n\s*(\w+)\??:/g;
const TIER_MARKER = /\/\*\* tier field \*\/\s*\n\s*(\w+)\??:/g;

const markedKeys = (source: string, marker: RegExp): string[] =>
  [...source.matchAll(marker)].map((match) => match[1] ?? '');

describe('contract audit', () => {
  test('every /** cost field */ marker names a member of COST_KEYS', () => {
    const keys = contractSources.flatMap((source) => markedKeys(source, COST_MARKER));
    // A refactor that renames the marker style must not silence this suite.
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(COST_KEYS.has(key)).toBe(true);
  });

  test('every /** tier field */ marker names a member of PRICE_TIER_KEYS', () => {
    // Track D marks its tier fields in contract-pricing.ts. If E lands before
    // D the list is empty here, which is fine: the assertion tightens the
    // moment the first marker appears.
    const keys = contractSources.flatMap((source) => markedKeys(source, TIER_MARKER));
    for (const key of keys) expect(PRICE_TIER_KEYS.has(key)).toBe(true);
  });
});
