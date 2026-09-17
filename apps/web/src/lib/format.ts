/**
 * Display formatting. Thai locale everywhere, because the UI copy is Thai.
 *
 * Money arrives from the API as an integer number of satang. Route it through
 * formatMoney() from @stockhub/core so the UI and the server agree on rounding.
 */

import { formatMoney, satang } from '@stockhub/core';
import type { MoneyAmount } from './api-types';

/** 125050 -> "1,250.50". No currency symbol. */
export const money = (value: MoneyAmount): string => formatMoney(satang(Math.round(value)));

/** 125050 -> "฿1,250.50". */
export const baht = (value: MoneyAmount): string => `฿${money(value)}`;

/** 12500 -> "12,500". Quantities are whole units. */
export const qty = (value: number): string => value.toLocaleString('th-TH');

/** 0.945 -> "94.5%". Pass a fraction, not a percentage. */
export const percent = (fraction: number, digits = 1): string =>
  `${(fraction * 100).toFixed(digits)}%`;

/** Already-a-percentage variant, for API fields like marginPct. */
export const percentValue = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;

const DATE_FMT = new Intl.DateTimeFormat('th-TH', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATE_TIME_FMT = new Intl.DateTimeFormat('th-TH', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso: string): string => DATE_FMT.format(new Date(iso));

export const formatDateTime = (iso: string): string => DATE_TIME_FMT.format(new Date(iso));

/** "3 นาทีที่แล้ว" style, good enough for an activity feed. */
export const formatRelative = (iso: string, now: Date = new Date()): string => {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  return formatDate(iso);
};

/** 20480 -> "20.0 KB". */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** ISO date string (YYYY-MM-DD) for <input type="date"> values. */
export const toDateInputValue = (date: Date): string => {
  const iso = date.toISOString();
  return iso.slice(0, 10);
};
