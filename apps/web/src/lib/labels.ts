/**
 * Thai display labels for every enum in @stockhub/core.
 *
 * Code stays English, the screen stays Thai. When core gains an enum value the
 * Record types below stop compiling until the label is added - that is on purpose.
 */

import type { BadgeTone } from '@/components/ui/badge';
import type {
  ChannelKind,
  ImportStatus,
  MatchSource,
  MovementReason,
  OrderStatus,
  VariantKind,
} from '@stockhub/core';
import { CHANNEL_KINDS, IMPORT_STATUSES, MOVEMENT_REASONS, ORDER_STATUSES } from '@stockhub/core';

export const CHANNEL_KIND_LABELS: Record<ChannelKind, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok: 'TikTok Shop',
  pos: 'หน้าร้าน (POS)',
  wholesale: 'ขายส่ง',
  manual: 'บันทึกเอง',
};

/** Brand-ish colours for the channel chips. Kept as literal Tailwind classes. */
export const CHANNEL_KIND_CLASSES: Record<ChannelKind, string> = {
  shopee: 'bg-orange-50 text-orange-700 ring-orange-200',
  lazada: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  tiktok: 'bg-slate-900 text-white ring-slate-900',
  pos: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  wholesale: 'bg-violet-50 text-violet-700 ring-violet-200',
  manual: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'รอชำระ/รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  shipped: 'จัดส่งแล้ว',
  delivered: 'ส่งถึงแล้ว',
  cancelled: 'ยกเลิก',
  returned: 'คืนสินค้า',
};

export const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  pending: 'warning',
  confirmed: 'info',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'danger',
  returned: 'purple',
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  uploaded: 'อัปโหลดแล้ว',
  parsing: 'กำลังอ่านไฟล์',
  preview_ready: 'รอตรวจสอบ',
  applying: 'กำลังบันทึก',
  applied: 'บันทึกสต็อกแล้ว',
  failed: 'ล้มเหลว',
};

export const IMPORT_STATUS_TONES: Record<ImportStatus, BadgeTone> = {
  uploaded: 'neutral',
  parsing: 'info',
  preview_ready: 'warning',
  applying: 'info',
  applied: 'success',
  failed: 'danger',
};

export const MOVEMENT_REASON_LABELS: Record<MovementReason, string> = {
  purchase_in: 'รับเข้าจากซัพพลายเออร์',
  sale_out: 'ตัดสต็อกจากการขาย',
  return_in: 'รับคืนจากลูกค้า',
  cancel_restore: 'คืนสต็อกจากออเดอร์ยกเลิก',
  adjust_in: 'ปรับเพิ่ม (ตรวจนับ)',
  adjust_out: 'ปรับลด (ชำรุด/สูญหาย)',
  transfer_in: 'รับโอนเข้าคลัง',
  transfer_out: 'โอนออกจากคลัง',
  bundle_assemble: 'ประกอบสินค้าชุด',
  bundle_disassemble: 'แยกสินค้าชุด',
};

export const MATCH_SOURCE_LABELS: Record<MatchSource, string> = {
  listing_map: 'จับคู่จากผังสินค้า',
  sku_exact: 'SKU ตรงกัน',
  sku_normalised: 'SKU ใกล้เคียง',
  manual: 'จับคู่เอง',
  unmatched: 'ยังไม่จับคู่',
};

export const MATCH_SOURCE_TONES: Record<MatchSource, BadgeTone> = {
  listing_map: 'success',
  sku_exact: 'success',
  sku_normalised: 'info',
  manual: 'purple',
  unmatched: 'danger',
};

export const VARIANT_KIND_LABELS: Record<VariantKind, string> = {
  simple: 'สินค้าเดี่ยว',
  bundle: 'สินค้าชุด',
};

/** Ready-made <Select> options. */
export const channelKindOptions = CHANNEL_KINDS.map((kind) => ({
  value: kind,
  label: CHANNEL_KIND_LABELS[kind],
}));

export const orderStatusOptions = ORDER_STATUSES.map((status) => ({
  value: status,
  label: ORDER_STATUS_LABELS[status],
}));

export const movementReasonOptions = MOVEMENT_REASONS.map((reason) => ({
  value: reason,
  label: MOVEMENT_REASON_LABELS[reason],
}));

export const importStatusOptions = IMPORT_STATUSES.map((status) => ({
  value: status,
  label: IMPORT_STATUS_LABELS[status],
}));
