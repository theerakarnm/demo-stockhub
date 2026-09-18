/**
 * Pure payload builder for the receive-goods form: form strings in, either a
 * validated ReceiveStockInput or one Thai error message out. No React, no API,
 * so the validation rules are testable with plain bun test.
 */

import { fromBaht } from '@stockhub/core';
import type { ReceiveStockInput } from './api-types';

export interface ReceiveFormState {
  variantId: string;
  qty: string;
  unitCostBaht: string;
  reference: string;
  receivedAt: string;
  note: string;
}

export const buildReceivePayload = (
  form: ReceiveFormState,
): ReceiveStockInput | { error: string } => {
  const qty = Number(form.qty);
  const cost = Number(form.unitCostBaht);
  if (!form.variantId) return { error: 'เลือกสินค้าก่อน' };
  if (!Number.isInteger(qty) || qty <= 0) return { error: 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0' };
  if (!Number.isFinite(cost) || cost < 0) return { error: 'ต้นทุนต่อหน่วยต้องเป็นตัวเลข 0 ขึ้นไป' };
  return {
    variantId: form.variantId,
    qty,
    unitCost: fromBaht(cost),
    reference: form.reference.trim() || undefined,
    receivedAt: form.receivedAt ? new Date(form.receivedAt).toISOString() : undefined,
    note: form.note.trim() || undefined,
  };
};
