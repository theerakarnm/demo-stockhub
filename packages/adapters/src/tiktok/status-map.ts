/**
 * TikTok Shop status string -> core OrderStatus.
 *
 * TikTok splits state across "Order Status" and "Order Substatus". The main
 * status is mapped here; the substatus is what tells "Cancelled by buyer before
 * shipping" (no stock ever left) from "Return requested after delivery" (stock
 * comes back). See TODO BLOCK 1 in adapter.ts.
 *
 * // VERIFY: written from memory of the TikTok Shop TH export.
 */

import type { OrderStatus } from '@stockhub/core';
import { normaliseHeader } from '../shared/header-match';

export const TIKTOK_STATUS_MAP: Readonly<Record<string, OrderStatus>> = {
  // --- not shipped yet ---
  unpaid: 'pending',
  รอชำระเงิน: 'pending',
  'awaiting shipment': 'confirmed',
  'to ship': 'confirmed',
  รอจัดส่ง: 'confirmed',
  // --- shipped: triggers sale_out ---
  'awaiting collection': 'shipped',
  'in transit': 'shipped',
  shipped: 'shipped',
  กำลังจัดส่ง: 'shipped',
  // --- closed ---
  delivered: 'delivered',
  completed: 'delivered',
  จัดส่งสำเร็จ: 'delivered',
  เสร็จสิ้น: 'delivered',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  'cancelled by buyer': 'cancelled',
  ยกเลิก: 'cancelled',
  // --- return/refund: triggers return_in ---
  'return/refund': 'returned',
  'return requested': 'returned',
  returned: 'returned',
  refunded: 'returned',
  คืนสินค้า: 'returned',
};

export const mapTiktokStatus = (raw: string | undefined): OrderStatus | undefined => {
  if (raw === undefined) return undefined;
  const key = normaliseHeader(raw);
  for (const [label, status] of Object.entries(TIKTOK_STATUS_MAP)) {
    if (normaliseHeader(label) === key) return status;
  }
  return undefined;
};
