/**
 * Pure availability merge for the bill screen.
 *
 * Kept free of React on purpose: "did the on-hand figure of any line change?"
 * is cheap to prove with unit tests, and the hook that fetches the balances
 * stays a thin timer around it.
 */

import type { CartLine } from './cart';

/**
 * Patch every line with its freshest available balance. Returns the SAME array
 * reference when nothing changed, so the caller can feed the result straight
 * into setState without causing a pointless re-render of the cart.
 */
export const mergeAvailability = (
  lines: CartLine[],
  balances: ReadonlyMap<string, number>,
): CartLine[] => {
  const touched = lines.some((line) => {
    const available = balances.get(line.variantId);
    return available !== undefined && available !== line.available;
  });
  if (!touched) return lines;
  return lines.map((line) => {
    const available = balances.get(line.variantId);
    return available === undefined ? line : { ...line, available };
  });
};

/**
 * Distinct variant ids to fetch, de-duplicated and sorted so the key is stable
 * across renders (it drives the refetch effect's dependency list).
 */
export const balanceFetchKeyOf = (variantIds: readonly string[]): string =>
  [...new Set(variantIds)].sort().join(',');
