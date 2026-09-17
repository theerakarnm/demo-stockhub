/**
 * LAZADA EXPORT COLUMN MAP - EDIT THIS FILE WHEN LAZADA CHANGES ITS EXPORT.
 *
 * Source: Seller Center -> Orders -> Manage Orders -> Export. Lazada TH ships
 * camelCase English headers even on the Thai UI, but sellers also forward files
 * that have been re-saved with translated headers, so both are listed.
 *
 * `// VERIFY:` marks a header written from memory of the Lazada export and NOT
 * checked against a real file. Confirm before trusting it.
 */

import type { ColumnAliasMap, HeaderSignature } from '../shared/header-match';

export const LAZADA_COLUMNS = {
  /** Lazada order number, e.g. 123456789012345. The idempotency key. */
  externalOrderId: ['orderNumber', 'Order Number', 'หมายเลขคำสั่งซื้อ', 'orderId'],
  /** Per-unit line id. See the "one row per unit" note in adapter.ts. */
  externalLineId: ['orderItemId', 'Order Item Id', 'orderItemIds'],
  orderStatus: ['status', 'Status', 'สถานะ', 'orderStatus'],
  orderedAt: ['createTime', 'Create Time', 'วันที่สั่งซื้อ', 'orderCreateTime'],
  // VERIFY: Lazada exports updateTime, not a dedicated ship time, on some
  // templates. deliveredDate exists on the "delivered" template only.
  shippedAt: ['deliveredDate', 'updateTime', 'Update Time', 'shippedDate'],
  /** Seller SKU. This is what matching.ts works on. */
  platformSku: ['sellerSku', 'Seller Sku', 'Seller SKU', 'sku'],
  /** Lazada's own SKU id. Useful for a listing_map row, not for matching. */
  lazadaSku: ['lazadaSku', 'Lazada Sku', 'lazadaId', 'Lazada Id'],
  productName: ['itemName', 'Item Name', 'ชื่อสินค้า', 'productName'],
  variationName: ['variation', 'Variation', 'ตัวเลือกสินค้า'],
  // VERIFY: many Lazada templates have NO quantity column because one row is
  // one unit. Keep this optional - adapter.ts defaults to 1 and counts rows.
  quantity: ['quantity', 'Quantity', 'จำนวน'],
  /** List price before any discount. */
  unitPrice: ['unitPrice', 'Unit Price', 'ราคาต่อหน่วย'],
  /** What the buyer actually paid for this unit. */
  paidPrice: ['paidPrice', 'Paid Price', 'ราคาที่ชำระ'],
  // VERIFY: seller-funded discount only. `platformDiscount` / voucher columns
  // are Lazada-funded and must not reduce the recorded sale value.
  sellerDiscount: ['sellerDiscountTotal', 'Seller Discount Total', 'sellerDiscount'],
  // VERIFY: order grand total header.
  grandTotal: ['orderTotal', 'Order Total', 'totalAmount', 'ยอดรวม'],
  buyerName: ['customerName', 'Customer Name', 'buyerName', 'ชื่อผู้ซื้อ'],
} as const satisfies ColumnAliasMap;

export type LazadaColumn = keyof typeof LAZADA_COLUMNS;

/**
 * `unique` holds the Lazada fingerprints. `orderItemId`, `lazadaSku` and
 * `paidPrice` exist on no other supported platform, which is what keeps a
 * Lazada file from being detected as Shopee (both use "Seller SKU").
 */
export const LAZADA_SIGNATURE: HeaderSignature = {
  required: [
    LAZADA_COLUMNS.externalOrderId,
    LAZADA_COLUMNS.orderStatus,
    LAZADA_COLUMNS.platformSku,
    LAZADA_COLUMNS.productName,
    LAZADA_COLUMNS.orderedAt,
  ],
  unique: [LAZADA_COLUMNS.externalLineId, LAZADA_COLUMNS.lazadaSku, LAZADA_COLUMNS.paidPrice],
};
