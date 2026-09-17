/**
 * Lazada status string -> core OrderStatus.
 *
 * Lazada exports the English machine status ("ready_to_ship") on most templates
 * and a Title Case label ("Ready to Ship") on others. Keys are matched after
 * normalisation (lowercase, spaces/underscores stripped), so both forms hit the
 * same entry.
 *
 * // VERIFY: written from memory of the Lazada TH export. Check against a real
 * file - a wrong mapping here moves stock at the wrong time.
 */

import type { OrderStatus } from '@stockhub/core';
import { normaliseHeader } from '../shared/header-match';

export const LAZADA_STATUS_MAP: Readonly<Record<string, OrderStatus>> = {
  // --- not shipped yet ---
  unpaid: 'pending',
  pending: 'pending',
  รอชำระเงิน: 'pending',
  ready_to_ship: 'confirmed',
  'ready to ship': 'confirmed',
  packed: 'confirmed',
  พร้อมจัดส่ง: 'confirmed',
  // --- shipped: triggers sale_out ---
  shipped: 'shipped',
  จัดส่งแล้ว: 'shipped',
  // --- closed ---
  delivered: 'delivered',
  จัดส่งสำเร็จ: 'delivered',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  ยกเลิก: 'cancelled',
  // --- return/refund: triggers return_in ---
  returned: 'returned',
  คืนสินค้า: 'returned',
  // VERIFY: a failed delivery comes back to the warehouse, so it restores
  // stock exactly like a return. Confirm the exact label with the seller.
  failed_delivery: 'returned',
  'failed delivery': 'returned',
};

export const mapLazadaStatus = (raw: string | undefined): OrderStatus | undefined => {
  if (raw === undefined) return undefined;
  const key = normaliseHeader(raw);
  for (const [label, status] of Object.entries(LAZADA_STATUS_MAP)) {
    if (normaliseHeader(label) === key) return status;
  }
  return undefined;
};
