// Contract between TOUR_STEPS and the real DOM: every step's targetId must
// exist as a data-tour-id somewhere under apps/web/src, and every non-tour
// data-tour-id must be claimed by a step (no dead targets). Run from the
// monorepo root; relative imports only.

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOUR_STEPS } from './tour-steps';

const APP_DIR = join(import.meta.dir, '..', '..', 'app');
const COMPONENTS_DIR = join(import.meta.dir, '..', '..');

const collect = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collect(full);
    return full.endsWith('.tsx') ? [full] : [];
  });

const tourFiles = (dir: string): string[] =>
  collect(dir).filter((file) => file.includes(`${join('components', 'tour')}`));

describe('tour targets', () => {
  const appSources = collect(APP_DIR);
  const componentSources = collect(COMPONENTS_DIR);

  test('every step that names a target can find it somewhere in the bundle', () => {
    const sources = [...appSources, ...componentSources];
    for (const step of TOUR_STEPS) {
      if (step.targetId === null) continue;
      const needle = `data-tour-id="${step.targetId}"`;
      const found = sources.some((file) => readFileSync(file, 'utf8').includes(needle));
      expect({ step: step.step, found }).toEqual({ step: step.step, found: true });
    }
  });

  // Panel controls carry an id for consistency but are never spotlight
  // targets: the panel itself cannot point at its own buttons.
  const PANEL_CONTROL_IDS = new Set(['tour-panel', 'reset-demo-button', 'raw-json-button']);

  test('every page-level data-tour-id is claimed by a step or is a panel control', () => {
    const claimed = new Set([...TOUR_STEPS.map((step) => step.targetId), ...PANEL_CONTROL_IDS]);
    // Skip the tour dir itself: tour-spotlight interpolates the id
    // (data-tour-id={targetId}), it is the mechanism, not a target.
    const sources = [...appSources, ...componentSources].filter(
      (file) => !file.includes(join('components', 'tour')),
    );
    for (const file of sources) {
      const src = readFileSync(file, 'utf8');
      for (const match of src.matchAll(/data-tour-id="([^"]+)"/g)) {
        expect(claimed.has(match[1] ?? '')).toBe(true);
      }
    }
  });
});
