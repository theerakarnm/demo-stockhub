'use client';

/**
 * Before/after capture for one walkthrough step.
 *
 * The panel reads the dashboard when a write step becomes active and again
 * when the user marks it done, then hands both snapshots to the data-flow
 * card. Nothing is hardcoded: the numbers on the card are always two reads of
 * the same endpoint the screens use.
 */

import { api } from '@/lib/api-client';
import type { DashboardSummary } from '@/lib/api-types';
import { useCallback, useRef, useState } from 'react';

export interface StepSnapshot {
  totalOnHand: number;
  stockValue?: number;
}

const toSnapshot = (summary: DashboardSummary): StepSnapshot => ({
  totalOnHand: summary.totalOnHand,
  // Absent for cost-blind roles; the card renders the value row only when set.
  ...(summary.stockValue !== undefined ? { stockValue: summary.stockValue } : {}),
});

export function useStepSnapshot() {
  const [before, setBefore] = useState<StepSnapshot | null>(null);
  const [after, setAfter] = useState<StepSnapshot | null>(null);
  const inflight = useRef(false);

  const captureBefore = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setBefore(toSnapshot(await api.getDashboardSummary()));
      setAfter(null);
    } catch {
      // A failed read must not break the walkthrough: the card just stays empty.
      setBefore(null);
    } finally {
      inflight.current = false;
    }
  }, []);

  const captureAfter = useCallback(async () => {
    try {
      setAfter(toSnapshot(await api.getDashboardSummary()));
    } catch {
      setAfter(null);
    }
  }, []);

  const clear = useCallback(() => {
    setBefore(null);
    setAfter(null);
  }, []);

  return { before, after, captureBefore, captureAfter, clear };
}
