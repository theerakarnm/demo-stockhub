/**
 * Value parser tests. These are real - parse-values.ts is fully implemented.
 */

import { describe, expect, test } from 'bun:test';
import { satang } from '@stockhub/core';
import {
  DEFAULT_TIME_ZONE,
  parseDate,
  parseMoney,
  parseQty,
  parseThaiNumber,
} from './parse-values';

describe('parseThaiNumber', () => {
  test('reads plain, separated and currency-tagged numbers', () => {
    expect(parseThaiNumber('259')).toBe(259);
    expect(parseThaiNumber('1,890.50')).toBe(1890.5);
    expect(parseThaiNumber('฿1,890.00')).toBe(1890);
    expect(parseThaiNumber('1,234.00 บาท')).toBe(1234);
  });

  test('reads Thai digits', () => {
    expect(parseThaiNumber('๑๒๓')).toBe(123);
  });

  test('reads both negative conventions', () => {
    expect(parseThaiNumber('-45.00')).toBe(-45);
    expect(parseThaiNumber('(45.00)')).toBe(-45);
  });

  test('returns undefined instead of guessing', () => {
    expect(parseThaiNumber('')).toBeUndefined();
    expect(parseThaiNumber('   ')).toBeUndefined();
    expect(parseThaiNumber('ไม่มีข้อมูล')).toBeUndefined();
    expect(parseThaiNumber(undefined)).toBeUndefined();
  });
});

describe('parseMoney', () => {
  test('converts baht to satang', () => {
    expect(parseMoney('259.00')).toBe(satang(25_900));
    expect(parseMoney('฿1,890.00')).toBe(satang(189_000));
    // 0.1 + 0.2 style rounding must not leak into the ledger.
    expect(parseMoney('0.07')).toBe(satang(7));
  });
});

describe('parseQty', () => {
  test('accepts whole units only', () => {
    expect(parseQty('3')).toBe(3);
    expect(parseQty('0')).toBe(0);
    expect(parseQty('1.5')).toBeUndefined();
    expect(parseQty('-2')).toBeUndefined();
  });
});

describe('parseDate', () => {
  test('reads a naive timestamp as Bangkok wall clock', () => {
    // 09:12:33 in Bangkok is 02:12:33 UTC.
    expect(parseDate('2026-02-14 09:12:33', DEFAULT_TIME_ZONE)?.toISOString()).toBe(
      '2026-02-14T02:12:33.000Z',
    );
  });

  test('reads day-first dates', () => {
    expect(parseDate('14/02/2026 09:30:00')?.toISOString()).toBe('2026-02-14T02:30:00.000Z');
  });

  test('reads a Buddhist-era year', () => {
    expect(parseDate('14/02/2569 09:30:00')?.toISOString()).toBe('2026-02-14T02:30:00.000Z');
  });

  test('trusts an explicit offset', () => {
    expect(parseDate('2026-02-14T09:12:33Z')?.toISOString()).toBe('2026-02-14T09:12:33.000Z');
  });

  test('honours a non-default timezone', () => {
    expect(parseDate('2026-02-14 09:12:33', 'UTC')?.toISOString()).toBe('2026-02-14T09:12:33.000Z');
  });

  test('returns undefined for junk', () => {
    expect(parseDate('ไม่ระบุ')).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
  });
});
