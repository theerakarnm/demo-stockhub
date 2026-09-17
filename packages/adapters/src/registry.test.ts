/**
 * Registry + detection tests.
 *
 * These are NOT skipped: detect() is fully implemented, so this file must stay
 * green. If it goes red after you touch a columns.ts, the alias you added is
 * ambiguous with another platform.
 *
 * Run: bun test
 */

import { describe, expect, test } from 'bun:test';
import { IMPORTABLE_CHANNEL_KINDS } from '@stockhub/core';
import { DETECTION_THRESHOLD, adapters, detectAdapter, detectAll, getAdapter } from './registry';
import {
  LAZADA_FIXTURE,
  SHOPEE_FIXTURE,
  TIKTOK_FIXTURE,
  loadFixture,
  notAnExport,
} from './test-helpers';

describe('registry', () => {
  test('registers exactly one adapter per importable channel kind', () => {
    expect(adapters.map((adapter) => adapter.kind).sort()).toEqual(
      [...IMPORTABLE_CHANNEL_KINDS].sort(),
    );
  });

  test('getAdapter returns the adapter for every importable kind', () => {
    for (const kind of IMPORTABLE_CHANNEL_KINDS) {
      expect(getAdapter(kind).kind).toBe(kind);
    }
  });

  test('every adapter exposes a display name and a source hint', () => {
    for (const adapter of adapters) {
      expect(adapter.displayName.length).toBeGreaterThan(0);
      expect(adapter.sourceHint.length).toBeGreaterThan(0);
    }
  });
});

describe('detectAdapter', () => {
  const cases = [
    { fixture: SHOPEE_FIXTURE, kind: 'shopee' },
    { fixture: LAZADA_FIXTURE, kind: 'lazada' },
    { fixture: TIKTOK_FIXTURE, kind: 'tiktok' },
  ] as const;

  for (const { fixture, kind } of cases) {
    test(`identifies ${fixture} as ${kind}`, async () => {
      const result = await detectAdapter(loadFixture(fixture));
      expect(result).not.toBeNull();
      expect(result?.kind).toBe(kind);
      expect(result?.confidence).toBeGreaterThanOrEqual(DETECTION_THRESHOLD);
      expect(result?.reason.length).toBeGreaterThan(0);
    });
  }

  test('returns null for a file that is not a marketplace export', async () => {
    expect(await detectAdapter(notAnExport())).toBeNull();
  });

  test('scores the correct platform strictly higher than the others', async () => {
    for (const { fixture, kind } of cases) {
      const ranked = await detectAll(loadFixture(fixture));
      const winner = ranked[0];
      const runnerUp = ranked[1];
      expect(winner?.kind).toBe(kind);
      expect(winner?.confidence).toBeGreaterThan(runnerUp?.confidence ?? 0);
    }
  });

  test('detectAll returns one result per adapter, highest confidence first', async () => {
    const ranked = await detectAll(loadFixture(SHOPEE_FIXTURE));
    expect(ranked).toHaveLength(adapters.length);
    const confidences = ranked.map((result) => result.confidence);
    expect([...confidences].sort((a, b) => b - a)).toEqual(confidences);
  });
});
