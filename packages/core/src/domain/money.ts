/**
 * Money is stored as an integer number of satang (1 THB = 100 satang).
 *
 * Reason: float arithmetic breaks FIFO cost layers. Every cost, price and total
 * in the system is an integer. Format only at the edge (UI / export).
 *
 * Unit cost can still need sub-satang precision when a lot is split, so the
 * FIFO engine works on lot totals, never on rounded per-unit values.
 * See src/services/costing/fifo.ts.
 */

declare const moneyBrand: unique symbol;

export type Satang = number & { readonly [moneyBrand]: 'Satang' };

export const satang = (value: number): Satang => {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Money must be an integer number of satang, got ${value}`);
  }
  return value as Satang;
};

export const ZERO = satang(0);

export const fromBaht = (baht: number): Satang => satang(Math.round(baht * 100));
export const toBaht = (value: Satang): number => value / 100;

export const addMoney = (a: Satang, b: Satang): Satang => satang(a + b);
export const subMoney = (a: Satang, b: Satang): Satang => satang(a - b);
export const mulMoney = (a: Satang, qty: number): Satang => satang(Math.round(a * qty));

/** Format for display, e.g. 125050 -> "1,250.50". Currency symbol is added by the UI. */
export const formatMoney = (value: Satang): string =>
  toBaht(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Postgres numeric columns arrive as strings; DB rows go through these two. */
export const fromDbNumeric = (value: string | number): Satang => satang(Math.round(Number(value)));
export const toDbNumeric = (value: Satang): string => String(value);
