/**
 * Cell value parsers. Small, pure, unit-testable.
 *
 * Adapters must never call `Number()` or `new Date()` on a raw cell directly -
 * marketplace exports are full of `"฿1,234.50"`, `"๑๒"`, `"1,234.50 บาท"` and
 * Buddhist-era years. Funnel everything through here.
 */

import { type Satang, fromBaht } from '@stockhub/core';

/** Every TH marketplace export we have seen prints local Bangkok wall time. */
export const DEFAULT_TIME_ZONE = 'Asia/Bangkok';

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

/** `"๑๒๓"` -> `"123"`. Rare in exports, common in hand-edited files. */
export const toArabicDigits = (value: string): string =>
  value.replace(/[\u0e50-\u0e59]/g, (digit) => String(THAI_DIGITS.indexOf(digit)));

/**
 * Parses a money-ish or quantity-ish cell into a plain number.
 *
 * Handles: thousands separators, `฿` / `THB` / `บาท`, Thai digits, a trailing
 * or leading minus, and accountant-style negatives `(1,234.50)`.
 * Returns `undefined` for an empty or non-numeric cell so the caller can raise
 * a ParseIssue instead of silently importing a 0.
 */
export const parseThaiNumber = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const text = toArabicDigits(raw).trim();
  if (text === '') return undefined;

  const negative = /^\(.*\)$/.test(text) || text.includes('-');
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return undefined;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return undefined;
  return negative ? -value : value;
};

/**
 * Money cell -> Satang. Marketplace exports print baht with 2 decimals, so
 * `fromBaht` (which rounds to the nearest satang) is the correct entry point.
 */
export const parseMoney = (raw: string | undefined): Satang | undefined => {
  const value = parseThaiNumber(raw);
  return value === undefined ? undefined : fromBaht(value);
};

/**
 * Quantity cell -> positive integer.
 * A fractional quantity is a data error for this business (tools are sold by
 * the piece), so it is rejected rather than rounded.
 */
export const parseQty = (raw: string | undefined): number | undefined => {
  const value = parseThaiNumber(raw);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
};

/**
 * Minutes that `timeZone` is ahead of UTC at the given instant.
 * Uses Intl, which is available in Bun, Node and the Workers runtime.
 */
const offsetMinutesAt = (timeZone: string, instant: Date): number => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = new Map(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  const num = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.get(type) ?? '0');
  const asIfUtc = Date.UTC(
    num('year'),
    num('month') - 1,
    num('day'),
    num('hour'),
    num('minute'),
    num('second'),
  );
  return (asIfUtc - instant.getTime()) / 60_000;
};

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Thai exports sometimes print the Buddhist year (2568 = 2025). */
const fromBuddhistYear = (year: number): number => (year >= 2400 ? year - 543 : year);

const DATE_PATTERNS: readonly { re: RegExp; dayFirst: boolean }[] = [
  // 2026-02-14 09:30:00 / 2026-02-14T09:30
  {
    re: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
    dayFirst: false,
  },
  // 14/02/2026 09:30:00 - day first, which is the TH convention
  {
    re: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
    dayFirst: true,
  },
];

const toWallClock = (text: string): WallClock | undefined => {
  for (const { re, dayFirst } of DATE_PATTERNS) {
    const m = re.exec(text);
    if (m === null) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    return {
      year: fromBuddhistYear(dayFirst ? c : a),
      // The month is always the middle group in both supported patterns.
      month: b,
      day: dayFirst ? a : c,
      hour: Number(m[4] ?? '0'),
      minute: Number(m[5] ?? '0'),
      second: Number(m[6] ?? '0'),
    };
  }
  return undefined;
};

/**
 * Parses an export date cell into a real instant.
 *
 * TIMEZONE HANDLING - THE IMPORTANT PART:
 *   Shopee/Lazada/TikTok TH exports print **local wall-clock time with no
 *   offset** ("2026-02-14 09:30:00" means 09:30 in Bangkok). Feeding that to
 *   `new Date()` in a UTC container silently shifts every order by 7 hours,
 *   which lands late-evening orders on the wrong business day and corrupts the
 *   FIFO ordering of movements.
 *
 *   Therefore: the wall clock is interpreted in `timeZone` (default
 *   Asia/Bangkok, taken from ParseContext.timeZone) and converted to a UTC
 *   instant. A value that already carries an explicit offset or `Z` is trusted
 *   as-is.
 *
 *   Thailand has no DST, but the two-pass offset resolution below is kept so
 *   the same helper stays correct if the product is ever sold outside TH.
 */
export const parseDate = (
  raw: string | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | undefined => {
  if (raw === undefined) return undefined;
  const text = toArabicDigits(raw).trim();
  if (text === '') return undefined;

  // Already unambiguous: ends with Z or has a +HH:MM / -HH:MM offset.
  if (/[zZ]$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(text)) {
    const direct = new Date(text);
    return Number.isNaN(direct.getTime()) ? undefined : direct;
  }

  const wall = toWallClock(text);
  if (wall === undefined) return undefined;

  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  if (Number.isNaN(asUtc)) return undefined;

  // Pass 1 uses the offset at the naive instant, pass 2 re-checks it in case
  // the first guess landed on the other side of a DST boundary.
  const firstGuess = asUtc - offsetMinutesAt(timeZone, new Date(asUtc)) * 60_000;
  const corrected = asUtc - offsetMinutesAt(timeZone, new Date(firstGuess)) * 60_000;
  return new Date(corrected);
};
