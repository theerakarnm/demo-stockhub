/**
 * TIKTOK SHOP EXPORT COLUMN MAP - EDIT THIS FILE WHEN TIKTOK CHANGES ITS EXPORT.
 *
 * Source: TikTok Shop Seller Center -> Orders -> All Orders -> Export. The file
 * is normally .xlsx (or .csv on the newer UI) and the header row is followed by
 * a human-readable DESCRIPTION ROW, which adapter.ts skips.
 *
 * TikTok prefixes every line-level money column with "SKU " - that prefix is the
 * easiest way to recognise the format by eye.
 *
 * `// VERIFY:` marks a header written from memory of the TikTok Shop TH export
 * and NOT checked against a real file.
 */

import type { ColumnAliasMap, HeaderSignature } from '../shared/header-match';

export const TIKTOK_COLUMNS = {
  /** TikTok order id, e.g. 5770000000000000000. The idempotency key. */
  externalOrderId: ['Order ID', 'order_id', 'หมายเลขคำสั่งซื้อ'],
  orderStatus: ['Order Status', 'order_status', 'สถานะคำสั่งซื้อ'],
  // VERIFY: substatus carries the real state for cancel/return flows
  // ("Awaiting collection", "Return requested"), so always read both.
  orderSubStatus: ['Order Substatus', 'Order Sub Status', 'สถานะย่อย'],
  orderedAt: ['Created Time', 'created_time', 'เวลาที่สร้าง', 'วันที่สั่งซื้อ'],
  // VERIFY: exact ship-time header.
  shippedAt: ['Shipped Time', 'shipped_time', 'เวลาจัดส่ง'],
  /** Seller SKU as typed by the seller. This is what matching.ts works on. */
  platformSku: ['Seller SKU', 'seller_sku', 'SKU ของผู้ขาย'],
  /** TikTok's internal SKU id. Good for a listing_map row, not for matching. */
  tiktokSkuId: ['SKU ID', 'sku_id'],
  productName: ['Product Name', 'product_name', 'ชื่อสินค้า'],
  variationName: ['Variation', 'variation', 'ตัวเลือกสินค้า'],
  quantity: ['Quantity', 'quantity', 'จำนวน'],
  /** Per-unit price before any discount. */
  unitPrice: ['SKU Unit Original Price', 'sku_unit_original_price', 'ราคาต่อหน่วย'],
  // VERIFY: seller-funded discount only. "SKU Platform Discount" is TikTok
  // funded and must NOT be subtracted from the recorded sale value.
  sellerDiscount: ['SKU Seller Discount', 'sku_seller_discount', 'ส่วนลดจากผู้ขาย'],
  // VERIFY: line subtotal header, useful as a cross-check in TODO BLOCK 2.
  lineSubtotal: ['SKU Subtotal After Discount', 'SKU Subtotal Before Discount'],
  grandTotal: ['Order Amount', 'order_amount', 'ยอดรวมคำสั่งซื้อ'],
  buyerName: ['Buyer Username', 'buyer_username', 'ชื่อผู้ซื้อ'],
} as const satisfies ColumnAliasMap;

export type TiktokColumn = keyof typeof TIKTOK_COLUMNS;

/**
 * `unique` holds the TikTok fingerprints. "Order Substatus", "SKU ID" and the
 * "SKU ..." money columns exist on no other supported platform. Without them a
 * TikTok file would score the same as Shopee, because both use the generic
 * headers "Order ID", "Order Status", "Seller SKU" and "Quantity".
 */
export const TIKTOK_SIGNATURE: HeaderSignature = {
  required: [
    TIKTOK_COLUMNS.externalOrderId,
    TIKTOK_COLUMNS.orderStatus,
    TIKTOK_COLUMNS.platformSku,
    TIKTOK_COLUMNS.quantity,
    TIKTOK_COLUMNS.productName,
  ],
  unique: [
    TIKTOK_COLUMNS.orderSubStatus,
    TIKTOK_COLUMNS.tiktokSkuId,
    ['SKU Unit Original Price', 'SKU Subtotal Before Discount'],
  ],
};
