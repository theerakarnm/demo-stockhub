// Contract marker audit (the Global Constraints marker rule).
//
// Every field in src/types/contract*.ts marked with the "cost field" doc
// comment must name a key in COST_KEYS, and every "tier field" marker a key in
// PRICE_TIER_KEYS. The comment is how a reviewer sees that a field is stripped
// by role. Since every Wave 2 track merged, the reverse direction is also
// enforced here: a key that belongs to a set must carry its marker, so a new
// field can never ship silently unredacted.

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

  test('no set key appears without its marker (reverse audit)', () => {
    for (const file of contractFiles) {
      const src = readFileSync(file, 'utf8');
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const field = /^\s*(\w+)\??:(?:\s|$)/.exec(lines[i] ?? '');
        const key = field?.[1];
        if (!key || (!COST_KEYS.has(key) && !PRICE_TIER_KEYS.has(key))) continue;
        // The nearest previous non-blank line must carry the matching marker,
        // so a reviewer sees the redaction intent right where the field lives.
        let prev = i - 1;
        while (prev >= 0 && (lines[prev] ?? '').trim() === '') prev--;
        const prevLine = (lines[prev] ?? '').trim();
        if (COST_KEYS.has(key)) {
          expect(prevLine.startsWith('/** cost field')).toBe(true);
        }
        if (PRICE_TIER_KEYS.has(key)) {
          expect(prevLine.startsWith('/** tier field')).toBe(true);
        }
      }
    }
  });
});
