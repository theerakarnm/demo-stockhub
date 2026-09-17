/**
 * SHOPEE EXPORT COLUMN MAP - EDIT THIS FILE WHEN SHOPEE CHANGES ITS EXPORT.
 *
 * This is the ONLY file you should have to touch when Shopee renames a column
 * in "คำสั่งซื้อของฉัน -> ส่งออก" (Seller Centre -> My Orders -> Export).
 * Add the new header to the front of the alias list and keep the old ones, so
 * files exported last month still import.
 *
 * Alias lists are resolved case-insensitively with spaces, punctuation and
 * zero-width characters stripped (see shared/header-match.ts), so you do NOT
 * need to add capitalisation variants.
 *
 * `// VERIFY:` marks a header that was written from memory of the Shopee TH
 * export and has NOT been checked against a real file. Confirm it against a
 * genuine export before trusting it in production.
 */

import type { ColumnAliasMap, HeaderSignature } from '../shared/header-match';

export const SHOPEE_COLUMNS = {
  /** Shopee order number, e.g. 2602141ABCDEFG. The idempotency key. */
  externalOrderId: ['หมายเลขคำสั่งซื้อ', 'Order ID', 'order_sn', 'หมายเลขคำสั่งซื้อ (Order ID)'],
  /** Thai status string, mapped in status-map.ts. */
  orderStatus: ['สถานะการสั่งซื้อ', 'Order Status', 'order_status'],
  // VERIFY: exact header of the cancel/return sub-status column.
  cancellationStatus: ['สถานะการยกเลิก/คืนเงิน', 'Cancellation/Return Status'],
  orderedAt: ['เวลาการสั่งซื้อ', 'Order Creation Time', 'วันที่สั่งซื้อ'],
  // VERIFY: payment time header.
  paidAt: ['เวลาชำระสินค้า', 'Order Paid Time'],
  // VERIFY: Shopee prints several ship-related times; this is the handover one.
  shippedAt: ['เวลาส่งสินค้า', 'วันที่ส่งสินค้า', 'Ship Time', 'Parcel Handover Time'],
  /** Seller SKU as typed by the seller. This is what matching.ts works on. */
  platformSku: [
    'เลขอ้างอิง SKU (SKU Reference No.)',
    'เลขอ้างอิง SKU',
    'SKU Reference No.',
    'Seller SKU',
  ],
  productName: ['ชื่อสินค้า', 'Product Name'],
  /** Shopee variation, e.g. "ขนาด L / สีแดง". */
  variationName: ['ชื่อตัวเลือก', 'Variation Name', 'ตัวเลือกสินค้า'],
  quantity: ['จำนวน', 'Quantity'],
  /** Price actually charged per unit after Shopee campaign price. */
  unitPrice: ['ราคาขาย', 'Deal Price', 'ราคาขาย (Deal Price)'],
  // VERIFY: seller-funded discount column. Platform-funded subsidy is a
  // different column and must NOT be treated as a seller discount.
  sellerDiscount: ['ส่วนลดจากผู้ขาย', 'Seller Discount', 'Seller Rebate'],
  // VERIFY: order grand total header.
  grandTotal: ['รวมยอดคำสั่งซื้อ', 'จำนวนเงินทั้งหมด', 'Total Amount', 'Order Total'],
  buyerName: ['ชื่อผู้ใช้ (ผู้ซื้อ)', 'Username (Buyer)', 'ชื่อผู้ซื้อ'],
} as const satisfies ColumnAliasMap;

export type ShopeeColumn = keyof typeof SHOPEE_COLUMNS;

/**
 * What detect() scores against.
 *
 * `unique` holds headers that no Lazada or TikTok export uses. "ชื่อตัวเลือก"
 * and the "(SKU Reference No.)" suffix are the strongest Shopee fingerprints -
 * they are the reason a Shopee file cannot be mistaken for a Lazada one.
 */
export const SHOPEE_SIGNATURE: HeaderSignature = {
  required: [
    SHOPEE_COLUMNS.externalOrderId,
    SHOPEE_COLUMNS.orderStatus,
    SHOPEE_COLUMNS.platformSku,
    SHOPEE_COLUMNS.quantity,
    SHOPEE_COLUMNS.productName,
  ],
  unique: [['ชื่อตัวเลือก'], ['เลขอ้างอิง SKU (SKU Reference No.)', 'เลขอ้างอิง SKU'], ['ชื่อผู้ใช้ (ผู้ซื้อ)']],
};
