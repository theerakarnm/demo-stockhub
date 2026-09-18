// Contract marker audit (the Global Constraints marker rule).
//
// Every field in src/types/contract*.ts marked with the "cost field" doc
// comment must name a key in COST_KEYS, and every "tier field" marker a key in
// PRICE_TIER_KEYS. The comment is how a reviewer sees that a field is stripped
// by role; the reverse test below is the other half (Task 40, after the merge):
// a set key with no marker fails, so a cost-bearing field cannot skip the sets.

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

/** A field declaration line at any indent, e.g. `  cogs?: MoneyOnWire;`. */
const FIELD_LINE = /^\s*(\w+)\??:/;

/** The marker comment forms the forward regexes above accept, on one line. */
const COST_MARKER_LINE = /^\/\*\*\s*cost field[^*]*\*\/$/;
const TIER_MARKER_LINE = /^\/\*\*\s*tier field[^*]*\*\/$/;

/** The nearest line above, blanks skipped - where the marker comment must sit. */
const previousNonBlank = (lines: readonly string[], index: number): string => {
  for (let i = index - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line !== undefined && line.trim() !== '') return line.trim();
  }
  return '';
};

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

  test('every COST_KEYS and PRICE_TIER_KEYS key in a contract file carries its marker', () => {
    for (const file of contractFiles) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (const [index, line] of lines.entries()) {
        const match = FIELD_LINE.exec(line);
        if (!match) continue;
        const key = match[1] ?? '';
        const above = previousNonBlank(lines, index);
        if (COST_KEYS.has(key)) {
          expect(
            COST_MARKER_LINE.test(above),
            `${file}:${index + 1}: cost key "${key}" lacks its /** cost field */ marker`,
          ).toBe(true);
        }
        if (PRICE_TIER_KEYS.has(key)) {
          expect(
            TIER_MARKER_LINE.test(above),
            `${file}:${index + 1}: tier key "${key}" lacks its /** tier field */ marker`,
          ).toBe(true);
        }
      }
    }
  });
});
