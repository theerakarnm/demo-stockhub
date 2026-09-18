// Contract marker audit (the Global Constraints marker rule).
//
// Every field in src/types/contract*.ts marked with the "cost field" doc
// comment must name a key in COST_KEYS, and every "tier field" marker a key in
// PRICE_TIER_KEYS. The comment is how a reviewer sees that a field is stripped
// by role; the reverse check (a set key with no marker) is Task 40, once every
// parallel track's contract file is merged.

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COST_KEYS, PRICE_TIER_KEYS } from '@stockhub/core';

const CONTRACT_DIR = join(import.meta.dir, 'types');
const contractFiles = readdirSync(CONTRACT_DIR)
  .filter((name) => name.startsWith('contract') && name.endsWith('.ts'))
  .map((name) => join(CONTRACT_DIR, name));

const COST_MARKER = /\/\*\*\s*cost field[^*]*\*\/\s*\n\s*(\w+)\??:/g;
const TIER_MARKER = /\/\*\* tier field \*\/\s*\n\s*(\w+)\??:/g;

describe('contract audit', () => {
  test('every cost field marker names a key in COST_KEYS', () => {
    for (const file of contractFiles) {
      const src = readFileSync(file, 'utf8');
      for (const match of src.matchAll(COST_MARKER)) {
        expect(COST_KEYS.has(match[1] ?? '')).toBe(true);
      }
    }
  });

  test('every tier field marker names a key in PRICE_TIER_KEYS', () => {
    for (const file of contractFiles) {
      const src = readFileSync(file, 'utf8');
      for (const match of src.matchAll(TIER_MARKER)) {
        expect(PRICE_TIER_KEYS.has(match[1] ?? '')).toBe(true);
      }
    }
  });
});
