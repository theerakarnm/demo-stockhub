'use client';

/**
 * Client-side state for the guided walkthrough.
 *
 * The provider is the ONLY writer of the localStorage key. Reading happens in
 * an effect, never during render, so the server HTML matches the first client
 * render (same rule as role-provider.tsx).
 *
 * Everything mutable lives in tour-state.ts as pure functions; this file just
 * persists what they return.
 */

import { GUIDED_DEMO } from '@/lib/config';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  type TourRefs,
  type TourState,
  completeStep as completeStepPure,
  dismissTour as dismissTourPure,
  initialTourState,
  nextStep as nextStepPure,
  prevStep as prevStepPure,
  reopenTour as reopenTourPure,
  resetTour,
  setTourRefs as setTourRefsPure,
} from './tour-state';
import { TOUR_STEP_COUNT } from './tour-state';

export const TOUR_STORAGE_KEY = 'stockhub.tour.state';

interface TourContextValue {
  state: TourState;
  next: () => void;
  prev: () => void;
  complete: (step: number) => void;
  dismiss: () => void;
  reopen: () => void;
  setRefs: (refs: Partial<TourRefs>) => void;
  reset: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

const readStored = (): TourState => {
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return initialTourState();
    const parsed = JSON.parse(raw) as Partial<TourState>;
    return {
      currentStep: typeof parsed.currentStep === 'number' ? parsed.currentStep : 0,
      completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
      dismissed: parsed.dismissed === true,
      refs: parsed.refs ?? {},
    };
  } catch {
    // A corrupted key must never brick the app: start over.
    return initialTourState();
  }
};

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TourState>(initialTourState);

  useEffect(() => {
    setState(readStored());
  }, []);

  const update = useCallback((next: (current: TourState) => TourState) => {
    setState((current) => {
      const value = next(current);
      window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(value));
      return value;
    });
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      state,
      next: () => update(nextStepPure),
      prev: () => update(prevStepPure),
      complete: (step: number) => update((current) => completeStepPure(current, step)),
      dismiss: () => update(dismissTourPure),
      reopen: () => update(reopenTourPure),
      setRefs: (refs: Partial<TourRefs>) => update((current) => setTourRefsPure(current, refs)),
      reset: () => update(resetTour),
    }),
    [state, update],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

/** Null when the flag is off - callers render nothing in that case. */
export function useTour(): TourContextValue | null {
  const ctx = useContext(TourContext);
  if (!GUIDED_DEMO) return null;
  return ctx;
}

export { TOUR_STEP_COUNT };
