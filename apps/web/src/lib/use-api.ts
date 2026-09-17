'use client';

/**
 * Tiny data-fetching hooks. No react-query - the demo needs three behaviours
 * only: load on mount, reload on demand, and re-run when the role changes.
 *
 * Usage:
 *   const { data, error, loading, reload } = useApi(() => api.getInventory({ q }), [q, role]);
 *
 * ALWAYS put `role` in the dependency list. Switching job position must refetch,
 * because the API strips cost fields per role.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from './api-error';
import { isApiError } from './api-error';

export interface UseApiResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Re-runs the fetcher, keeping the previous data on screen until it resolves. */
  reload: () => void;
}

const toApiError = (cause: unknown): ApiError => {
  if (isApiError(cause)) return cause;
  // Never let a non-ApiError escape into a screen: every page renders `error.message`.
  return {
    name: 'ApiError',
    code: 'unknown',
    message: cause instanceof Error ? cause.message : 'เกิดข้อผิดพลาดที่ไม่รู้จัก',
    status: 0,
    isNotImplemented: false,
    isForbidden: false,
  } as ApiError;
};

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // Keep the latest fetcher without making it a dependency - the caller's
  // `deps` array is the real cache key.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // `deps` is the caller's cache key by design, and `fetcher` is read through a
  // ref on purpose so that an inline arrow function does not refetch on every
  // render. See the module comment.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are owned by the caller.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(toApiError(cause));
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload };
}

export interface UseMutationResult<TInput, TResult> {
  run: (input: TInput) => Promise<TResult | null>;
  pending: boolean;
  error: ApiError | null;
  result: TResult | null;
  reset: () => void;
}

/** For POST endpoints: apply an import, create a POS bill, save a SKU match. */
export function useMutation<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
): UseMutationResult<TInput, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  const actionRef = useRef(action);
  actionRef.current = action;

  const run = useCallback(async (input: TInput): Promise<TResult | null> => {
    setPending(true);
    setError(null);
    try {
      const value = await actionRef.current(input);
      setResult(value);
      return value;
    } catch (cause) {
      setError(toApiError(cause));
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  return { run, pending, error, result, reset };
}
