/**
 * Pure repricing for the bill screen.
 *
 * When the picked customer changes, the page fetches one resolution per line
 * and hands both to repriceLines: untouched lines take the resolved price,
 * lines the cashier edited by hand keep theirs - the override is the point of
 * priceTouched. priceSourceLabel turns the source into the small Thai caption
 * under the price input.
 */

import type { PriceResolutionView } from '@/lib/api-types-pricing';
import type { PriceSource } from '@stockhub/core';
import type { CartLine } from './cart';

export const priceSourceLabel = (source: PriceSource): string => {
  switch (source) {
    case 'tier':
      return 'ราคาตามระดับลูกค้า';
    case 'default_tier':
      return 'ราคาระดับเริ่มต้น';
    case 'selling_price':
      return 'ราคาขายมาตรฐาน (ยังไม่ตั้งราคาระดับนี้)';
  }
};

/** Reprice every untouched line from its resolution; the rest pass through. */
export const repriceLines = (lines: CartLine[], resolutions: PriceResolutionView[]): CartLine[] => {
  const byVariant = new Map(resolutions.map((resolution) => [resolution.variantId, resolution]));
  return lines.map((line) => {
    if (line.priceTouched) return line;
    const resolution = byVariant.get(line.variantId);
    if (!resolution) return line;
    // The input works in baht; the resolution is satang.
    return {
      ...line,
      priceBaht: (resolution.price / 100).toFixed(2),
      priceSource: resolution.priceSource,
    };
  });
};
