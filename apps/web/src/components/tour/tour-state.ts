/**
 * Pure state machine for the guided walkthrough. No React, no localStorage, no
 * DOM - apps/web has no component-test harness, so everything that can be
 * logic is logic (same split as receive-form.ts / reprice.ts).
 *
 * The tour is 20 steps, numbered 1..20 to match docs/demo-walkthrough.md
 * section C. `refs` holds runtime ids (orders and imports created mid-tour)
 * so the "ไปดูหน้าที่กระทบ" deep links can point at the thing the user just
 * made instead of a dead seed id.
 */

export const TOUR_STEP_COUNT = 20;

export interface TourRefs {
  /** FRT-UREA-50 variant id, created by the seed, discovered at tour start. */
  ureaVariantId?: string;
  /** Latest import batch the tour applied. */
  lastImportId?: string;
  /** The wholesale bill from scene 12. */
  wholesaleOrderId?: string;
  /** The storefront bill from scene 15 (the one later cancelled). */
  posOrderId?: string;
}

export interface TourState {
  /** 0 = not started, 1..TOUR_STEP_COUNT = the step the user is on. */
  currentStep: number;
  /** Steps finished, in any order - the user may do them out of sequence. */
  completedSteps: number[];
  /** The user closed the panel; a floating button can reopen it. */
  dismissed: boolean;
  refs: TourRefs;
}

export const initialTourState = (): TourState => ({
  currentStep: 0,
  completedSteps: [],
  dismissed: false,
  refs: {},
});

/** Clamp helper: every transition goes through this, so nothing escapes 0..20. */
const clamp = (step: number): number => Math.min(TOUR_STEP_COUNT, Math.max(0, step));

export const nextStep = (state: TourState): TourState => ({
  ...state,
  currentStep: clamp(state.currentStep + 1),
});

export const prevStep = (state: TourState): TourState => ({
  ...state,
  currentStep: clamp(state.currentStep - 1),
});

const withoutStep = (steps: number[], step: number): number[] =>
  steps.filter((entry) => entry !== step);

/**
 * Mark a step done and point the panel at the FIRST still-open step.
 *
 * The user may act out of order, so the panel always shows the oldest thing
 * left to do: finishing step 12 while on step 6 does not skip 7..11, it falls
 * back to whatever earlier step is still open. When every step 1..20 is done,
 * park on the last one so the panel can show the finished state.
 */
export const completeStep = (state: TourState, step: number): TourState => {
  const stepInBounds = clamp(step);
  if (stepInBounds === 0) return state;

  const completedSteps = [...withoutStep(state.completedSteps, stepInBounds), stepInBounds];
  const firstOpen = Array.from({ length: TOUR_STEP_COUNT }, (_, i) => i + 1).find(
    (candidate) => !completedSteps.includes(candidate),
  );
  return { ...state, completedSteps, currentStep: firstOpen ?? TOUR_STEP_COUNT };
};

export const dismissTour = (state: TourState): TourState => ({ ...state, dismissed: true });

export const reopenTour = (state: TourState): TourState => ({ ...state, dismissed: false });

export const setTourRefs = (state: TourState, refs: Partial<TourRefs>): TourState => ({
  ...state,
  refs: { ...state.refs, ...refs },
});

/** Reset the walk, keep nothing - this is what the reset button calls. */
export const resetTour = (): TourState => initialTourState();

/** Progress fraction for the panel bar, 0..1. */
export const tourProgress = (state: TourState): number =>
  state.completedSteps.length / TOUR_STEP_COUNT;
