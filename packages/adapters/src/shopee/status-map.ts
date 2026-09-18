/**
 * Shopee status string -> core OrderStatus.
 *
 * Shopee TH exports print the Thai label; the English Seller Centre prints the
 * English one. Both are listed. Keys are matched after normalisation
 * (lowercase, spaces stripped), so "To Ship" and "to ship" are the same key.
 *
 * // VERIFY: these labels were written from memory of the Shopee TH export and
 * must be checked against a real file. A wrong mapping here moves stock at the
 * wrong time, which is the most expensive class of bug in this system.
 */

import type { OrderStatus } from '@stockhub/core';
import { normaliseHeader } from '../shared/header-match';

/** Raw platform label -> normalised core status. */
export const SHOPEE_STATUS_MAP: Readonly<Record<string, OrderStatus>> = {
  // --- not shipped yet: no stock movement ---
  รอการชำระเงิน: 'pending', // Unpaid
  unpaid: 'pending',
  ที่ต้องจัดส่ง: 'confirmed', // To Ship - stock is reserved
  'to ship': 'confirmed',
  'ready to ship': 'confirmed',
  // --- shipped: triggers sale_out ---
  จัดส่งแล้ว: 'shipped',
  shipping: 'shipped',
  shipped: 'shipped',
  // --- closed ---
  สำเร็จแล้ว: 'delivered',
  completed: 'delivered',
  ยกเลิกแล้ว: 'cancelled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  // Values of the cancellation/return substatus column ("สถานะการยกเลิก/คืนเงิน"),
  // not the main status column: the adapter reads this column to override a
  // "completed" status when the goods actually came back.
  ยกเลิกโดยผู้ซื้อ: 'cancelled',
  'cancelled by buyer': 'cancelled',
  // --- return/refund: triggers return_in ---
  'คืนสินค้า/คืนเงิน': 'returned',
  'return/refund': 'returned',
  returned: 'returned',
};

/**
 * Maps a Shopee status cell. Returns undefined for an unknown label so the
 * adapter can raise a ParseIssue instead of guessing - never default to
 * 'shipped', that would move stock for an order that never left the shelf.
 */
export const mapShopeeStatus = (raw: string | undefined): OrderStatus | undefined => {
  if (raw === undefined) return undefined;
  const key = normaliseHeader(raw);
  for (const [label, status] of Object.entries(SHOPEE_STATUS_MAP)) {
    if (normaliseHeader(label) === key) return status;
  }
  return undefined;
};
