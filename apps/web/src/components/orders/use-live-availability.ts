'use client';

/**
 * Live on-hand for the bill screen.
 *
 * The `available` figure of a cart line is frozen when the line is added, but
 * stock keeps moving while the cashier builds the bill: an import apply or a
 * second till can consume the same lot. The page therefore re-reads every cart
 * variant's balance on a short interval (and whenever the cart changes), so
 * the over-sell warning reflects reality close to the moment of submit.
 */

import { api } from '@/lib/api-client';
import { useEffect, useState } from 'react';
import { balanceFetchKeyOf } from './availability';

/** Stock moves on shop-floor timescales, not milliseconds - 20s is plenty. */
const REFRESH_MS = 20_000;

/**
 * Available balances of the given variants, refreshed on cart change and on
 * a fixed interval. Variant lookups that fail (deleted mid-sale, network)
 * simply contribute no entry: the cart keeps its stale figure rather than
 * blocking the sale over a refresh.
 */
export const useLiveAvailability = (variantIds: readonly string[]): ReadonlyMap<string, number> => {
  const [balances, setBalances] = useState<ReadonlyMap<string, number>>(new Map());
  const key = balanceFetchKeyOf(variantIds);

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    const refresh = (): void => {
      void Promise.all(key.split(',').map((id) => api.getVariant(id).catch(() => null))).then(
        (details) => {
          if (cancelled) return;
          const next = new Map<string, number>();
          for (const detail of details) {
            if (detail) next.set(detail.variant.id, detail.available);
          }
          setBalances(next);
        },
      );
    };
    void refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return balances;
};
