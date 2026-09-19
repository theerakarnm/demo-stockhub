// Pure-logic tests for the walkthrough state machine. Relative imports only:
// bun test runs from the monorepo root where apps/web's tsconfig paths are
// invisible (see permission-gate.test.ts for the same note).

import { describe, expect, test } from 'bun:test';
import {
  TOUR_STEP_COUNT,
  completeStep,
  dismissTour,
  initialTourState,
  nextStep,
  prevStep,
  reopenTour,
  resetTour,
  setTourRefs,
  tourProgress,
} from './tour-state';

describe('tour-state', () => {
  test('starts unstarted at 0 with no completed steps', () => {
    const state = initialTourState();
    expect(state.currentStep).toBe(0);
    expect(state.completedSteps).toEqual([]);
    expect(state.dismissed).toBe(false);
  });

  test('next advances and never passes the last step', () => {
    let state = initialTourState();
    for (let i = 0; i < TOUR_STEP_COUNT + 5; i++) state = nextStep(state);
    expect(state.currentStep).toBe(TOUR_STEP_COUNT);
  });

  test('prev never goes below 0', () => {
    expect(prevStep(initialTourState()).currentStep).toBe(0);
    expect(prevStep({ ...initialTourState(), currentStep: 3 }).currentStep).toBe(2);
  });

  test('completing an out-of-order step falls back to the FIRST open step', () => {
    // The panel always shows the oldest thing left to do.
    let state = { ...initialTourState(), currentStep: 6 };
    state = completeStep(state, 12);
    expect(state.completedSteps).toEqual([12]);
    // Nothing before 12 is done, so the panel falls back to step 1.
    expect(state.currentStep).toBe(1);

    // With 1..5 already done, the same stray step-12 completion lands on 6.
    state = initialTourState();
    for (const step of [1, 2, 3, 4, 5]) state = completeStep(state, step);
    state = completeStep(state, 12);
    expect(state.currentStep).toBe(6);
  });

  test('completing every step parks on the last step', () => {
    let state = initialTourState();
    for (let step = 1; step <= TOUR_STEP_COUNT; step++) state = completeStep(state, step);
    expect(state.currentStep).toBe(TOUR_STEP_COUNT);
    expect(state.completedSteps).toHaveLength(TOUR_STEP_COUNT);
  });

  test('completing step 0 is a no-op', () => {
    const state = completeStep(initialTourState(), 0);
    expect(state).toEqual(initialTourState());
  });

  test('dismiss and reopen toggle without losing progress', () => {
    let state = completeStep(initialTourState(), 1);
    state = dismissTour(state);
    expect(state.dismissed).toBe(true);
    expect(state.completedSteps).toEqual([1]);
    state = reopenTour(state);
    expect(state.dismissed).toBe(false);
  });

  test('refs merge partially and resetTour wipes everything', () => {
    let state = setTourRefs(initialTourState(), { wholesaleOrderId: 'order-1' });
    state = setTourRefs(state, { lastImportId: 'batch-9' });
    expect(state.refs.wholesaleOrderId).toBe('order-1');
    expect(state.refs.lastImportId).toBe('batch-9');
    expect(resetTour().currentStep).toBe(0);
    expect(resetTour().refs).toEqual({});
  });

  test('progress is the completed fraction', () => {
    expect(tourProgress(initialTourState())).toBe(0);
    let state = initialTourState();
    for (const step of [1, 2, 3]) state = completeStep(state, step);
    expect(tourProgress(state)).toBeCloseTo(3 / TOUR_STEP_COUNT, 5);
    let all = initialTourState();
    for (let step = 1; step <= TOUR_STEP_COUNT; step++) all = completeStep(all, step);
    expect(tourProgress(all)).toBe(1);
  });
});
