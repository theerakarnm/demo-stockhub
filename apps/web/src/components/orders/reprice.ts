/**
 * Repricing the bill when the customer (and so the tier) changes.
 *
 * The cashier is the boss of a line they edited by hand: `priceTouched` marks
 * those lines and repriceLines never overwrites them. Everything else follows
 * the resolution the API answered, and the line remembers WHY its price is
 * what it is (`priceSource`) so the cart can show it under the input.
 */

import type { PriceResolutionView, PriceSource } from '@/lib/api-types-pricing';
import type { CartLine } from './cart';

/**
 * Apply resolutions to the cart, in place semantics without mutating:
 * an untouched line with a matching resolution gets the answered price;
 * touched lines and lines without a resolution stay exactly as they are.
 */
export const repriceLines = (lines: CartLine[], resolutions: PriceResolutionView[]): CartLine[] => {
  const byVariant = new Map(resolutions.map((resolution) => [resolution.variantId, resolution]));
  return lines.map((line) => {
    if (line.priceTouched) return line;
    const resolution = byVariant.get(line.variantId);
    if (!resolution) return line;
    return {
      ...line,
      // Satang integer -> the baht text the input shows.
      priceBaht: (resolution.price / 100).toFixed(2),
      priceSource: resolution.priceSource,
    };
  });
};

/** Thai reason shown under the price input of each bill line. */
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
