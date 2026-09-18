// MOCK: ---------------------------------------------------------------------
// MOCK: Demo fixtures. Agricultural-tool shop, Thai SME, 8 channels.
// MOCK:
// MOCK: This is the ONLY file with fake data. Deleting it is one step:
// MOCK:   1. set NEXT_PUBLIC_DEMO_MODE=false
// MOCK:   2. delete this file and the `demo(...)` wrapper in api-client.ts
// MOCK: Nothing else imports it.
// MOCK:
// MOCK: The fixtures imitate the API faithfully on purpose: they run the same
// MOCK: stripCost() from @stockhub/core, so switching role in the demo removes
// MOCK: the cost fields here exactly like the real backend would.
// MOCK: ---------------------------------------------------------------------

import { can, permissionsOf, stripCost } from '@stockhub/core';
import { ApiError } from './api-error';
import type {
  ApplyImportResult,
  Channel,
  CogsQuery,
  CogsReportResponse,
  CogsReportRow,
  CreateOrderInput,
  DashboardSummary,
  HealthResponse,
  ImportBatch,
  ImportDetailResponse,
  InventoryQuery,
  InventoryResponse,
  MatchSkuInput,
  MatchSkuResult,
  MeResponse,
  Movement,
  MovementsQuery,
  MovementsResponse,
  Order,
  OrderLine,
  OrdersQuery,
  OrdersResponse,
  PreviewOrder,
  ReceiveStockInput,
  ReturnOrderLineInput,
  StockLotRow,
  StockRow,
  UnmatchedSku,
  VariantDetailResponse,
  VariantSummary,
} from './api-types';
import { DEMO_ORG_ID } from './config';
import { getDemoIdentity } from './demo-identity';

/** Cost gate, identical in spirit to the API response helper. */
const gate = <T>(payload: T): T => {
  const { role } = getDemoIdentity();
  return can(role, 'cost:read') ? payload : stripCost(payload);
};

const iso = (daysAgo: number, hour = 9, minute = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

// ---------------------------------------------------------------------------
// Channels - 6 online shops + counter + wholesale
// ---------------------------------------------------------------------------

export const MOCK_CHANNELS: Channel[] = [
  {
    id: 'ch_shopee_main',
    orgId: DEMO_ORG_ID,
    kind: 'shopee',
    name: 'Shopee - เกษตรรุ่งเรือง',
    isActive: true,
    externalShopId: 'SHP-114522',
    lastImportAt: iso(0, 8, 40),
  },
  {
    id: 'ch_shopee_outlet',
    orgId: DEMO_ORG_ID,
    kind: 'shopee',
    name: 'Shopee - Outlet ลดล้างสต็อก',
    isActive: true,
    externalShopId: 'SHP-220913',
    lastImportAt: iso(1, 17, 5),
  },
  {
    id: 'ch_lazada_main',
    orgId: DEMO_ORG_ID,
    kind: 'lazada',
    name: 'Lazada - เกษตรรุ่งเรือง',
    isActive: true,
    externalShopId: 'LZD-88231',
    lastImportAt: iso(0, 9, 12),
  },
  {
    id: 'ch_lazada_flash',
    orgId: DEMO_ORG_ID,
    kind: 'lazada',
    name: 'Lazada - Flash Store',
    isActive: true,
    externalShopId: 'LZD-90117',
    lastImportAt: iso(3, 10, 30),
  },
  {
    id: 'ch_tiktok_main',
    orgId: DEMO_ORG_ID,
    kind: 'tiktok',
    name: 'TikTok Shop - เกษตรรุ่งเรือง',
    isActive: true,
    externalShopId: 'TTS-55017',
    lastImportAt: iso(1, 20, 15),
  },
  {
    id: 'ch_tiktok_live',
    orgId: DEMO_ORG_ID,
    kind: 'tiktok',
    name: 'TikTok Shop - ไลฟ์สด',
    isActive: true,
    externalShopId: 'TTS-55018',
    lastImportAt: iso(2, 21, 45),
  },
  { id: 'ch_pos_shop', orgId: DEMO_ORG_ID, kind: 'pos', name: 'หน้าร้าน - สาขาหลัก', isActive: true },
  {
    id: 'ch_wholesale',
    orgId: DEMO_ORG_ID,
    kind: 'wholesale',
    name: 'ขายส่ง - ตัวแทนจำหน่าย',
    isActive: true,
  },
];

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

interface MockVariant extends VariantSummary {
  onHand: number;
  reserved: number;
  avgUnitCost: number;
  lots: StockLotRow[];
}

const lot = (
  variantId: string,
  index: number,
  remainingQty: number,
  receivedQty: number,
  unitCost: number,
  daysAgo: number,
  reference: string,
): StockLotRow => ({
  id: `lot_${variantId}_${index}`,
  variantId,
  remainingQty,
  receivedQty,
  unitCost,
  receivedAt: iso(daysAgo, 11),
  reference,
});

export const MOCK_VARIANTS: MockVariant[] = [
  {
    id: 'var_hoe_4h',
    productId: 'prd_hoe',
    sku: 'HOE-4H-STD',
    name: 'จอบถางหญ้า ด้ามไม้ 4 หุน',
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: 18500,
    lowStockThreshold: 20,
    barcode: '8851234500011',
    onHand: 142,
    reserved: 12,
    avgUnitCost: 11230,
    lots: [
      lot('var_hoe_4h', 1, 42, 120, 10800, 96, 'PO-2024-0311 ร้านเหล็กชัยพร'),
      lot('var_hoe_4h', 2, 100, 100, 11400, 34, 'PO-2024-0412 ร้านเหล็กชัยพร'),
    ],
  },
  {
    id: 'var_spade_stl',
    productId: 'prd_spade',
    sku: 'SPD-STL-01',
    name: 'เสียมขุดดิน เหล็กกล้าชุบแข็ง',
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: 24900,
    lowStockThreshold: 15,
    barcode: '8851234500028',
    onHand: 68,
    reserved: 4,
    avgUnitCost: 15650,
    lots: [
      lot('var_spade_stl', 1, 18, 80, 15200, 72, 'PO-2024-0330 โรงงานอุดร'),
      lot('var_spade_stl', 2, 50, 60, 15800, 21, 'PO-2024-0428 โรงงานอุดร'),
    ],
  },
  {
    id: 'var_machete_12',
    productId: 'prd_machete',
    sku: 'KNF-ELP-12',
    name: 'มีดพร้า ตราช้าง 12 นิ้ว',
    kind: 'simple',
    unit: 'เล่ม',
    sellingPrice: 15900,
    lowStockThreshold: 25,
    barcode: '8851234500035',
    onHand: 11,
    reserved: 3,
    avgUnitCost: 9450,
    lots: [lot('var_machete_12', 1, 11, 150, 9450, 58, 'PO-2024-0402 ตัวแทนภาคกลาง')],
  },
  {
    id: 'var_pruner_24',
    productId: 'prd_pruner',
    sku: 'PRN-LNG-24',
    name: 'กรรไกรตัดกิ่ง ด้ามยาว 24 นิ้ว',
    kind: 'simple',
    unit: 'อัน',
    sellingPrice: 42000,
    lowStockThreshold: 10,
    barcode: '8851234500042',
    onHand: 34,
    reserved: 2,
    avgUnitCost: 27800,
    lots: [
      lot('var_pruner_24', 1, 9, 40, 26900, 65, 'PO-2024-0325 นำเข้า Zhejiang'),
      lot('var_pruner_24', 2, 25, 30, 28100, 18, 'PO-2024-0505 นำเข้า Zhejiang'),
    ],
  },
  {
    id: 'var_sprayer_16',
    productId: 'prd_sprayer',
    sku: 'SPR-BAT-16L',
    name: 'เครื่องพ่นยา แบตเตอรี่ 16 ลิตร',
    kind: 'simple',
    unit: 'เครื่อง',
    sellingPrice: 189000,
    lowStockThreshold: 8,
    barcode: '8851234500059',
    onHand: 23,
    reserved: 5,
    avgUnitCost: 132500,
    lots: [
      lot('var_sprayer_16', 1, 3, 25, 128000, 88, 'PO-2024-0318 นำเข้า Guangzhou'),
      lot('var_sprayer_16', 2, 20, 20, 133200, 12, 'PO-2024-0510 นำเข้า Guangzhou'),
    ],
  },
  {
    id: 'var_hose_20',
    productId: 'prd_hose',
    sku: 'HOSE-PVC-20M',
    name: 'สายยางรดน้ำ PVC 20 เมตร',
    kind: 'simple',
    unit: 'ม้วน',
    sellingPrice: 32900,
    lowStockThreshold: 12,
    barcode: '8851234500066',
    onHand: 7,
    reserved: 1,
    avgUnitCost: 21400,
    lots: [lot('var_hose_20', 1, 7, 60, 21400, 41, 'PO-2024-0420 ร้านพลาสติกไทย')],
  },
  {
    id: 'var_nozzle_brass',
    productId: 'prd_nozzle',
    sku: 'NZL-BRS-01',
    name: 'หัวฉีดน้ำทองเหลือง ปรับ 8 จังหวะ',
    kind: 'simple',
    unit: 'อัน',
    sellingPrice: 8900,
    lowStockThreshold: 30,
    barcode: '8851234500073',
    onHand: 210,
    reserved: 18,
    avgUnitCost: 4820,
    lots: [
      lot('var_nozzle_brass', 1, 60, 200, 4600, 77, 'PO-2024-0329 ตลาดคลองถม'),
      lot('var_nozzle_brass', 2, 150, 150, 4910, 25, 'PO-2024-0501 ตลาดคลองถม'),
    ],
  },
  {
    id: 'var_urea_50',
    productId: 'prd_urea',
    sku: 'FRT-UREA-50',
    name: 'ปุ๋ยยูเรีย 46-0-0 ขนาด 50 กก.',
    kind: 'simple',
    unit: 'กระสอบ',
    sellingPrice: 78000,
    lowStockThreshold: 40,
    barcode: '8851234500080',
    onHand: 96,
    reserved: 20,
    avgUnitCost: 62500,
    lots: [
      lot('var_urea_50', 1, 16, 100, 60800, 52, 'PO-2024-0408 สหกรณ์การเกษตร'),
      lot('var_urea_50', 2, 80, 80, 62840, 9, 'PO-2024-0514 สหกรณ์การเกษตร'),
    ],
  },
  {
    id: 'var_gloves_l',
    productId: 'prd_gloves',
    sku: 'GLV-THN-L',
    name: 'ถุงมือกันหนาม ไซส์ L',
    kind: 'simple',
    unit: 'คู่',
    sellingPrice: 6500,
    lowStockThreshold: 50,
    barcode: '8851234500097',
    onHand: 18,
    reserved: 0,
    avgUnitCost: 3350,
    lots: [lot('var_gloves_l', 1, 18, 300, 3350, 30, 'PO-2024-0426 โรงงานสมุทรปราการ')],
  },
  {
    id: 'var_rake_14',
    productId: 'prd_rake',
    sku: 'RKE-STL-14',
    name: 'คราดเหล็ก 14 ซี่ ด้ามยาว',
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: 21500,
    lowStockThreshold: 15,
    barcode: '8851234500103',
    onHand: 54,
    reserved: 6,
    avgUnitCost: 13900,
    lots: [lot('var_rake_14', 1, 54, 90, 13900, 44, 'PO-2024-0417 ร้านเหล็กชัยพร')],
  },
  {
    id: 'var_bundle_garden',
    productId: 'prd_bundle_garden',
    sku: 'BND-GARDEN-START',
    name: 'ชุดเริ่มต้นทำสวน (จอบ+เสียม+ถุงมือ)',
    kind: 'bundle',
    unit: 'ชุด',
    sellingPrice: 45900,
    lowStockThreshold: 5,
    onHand: 0,
    reserved: 0,
    avgUnitCost: 30230,
    lots: [],
    components: [
      {
        componentVariantId: 'var_hoe_4h',
        sku: 'HOE-4H-STD',
        name: 'จอบถางหญ้า ด้ามไม้ 4 หุน',
        qtyPerBundle: 1,
        componentOnHand: 142,
      },
      {
        componentVariantId: 'var_spade_stl',
        sku: 'SPD-STL-01',
        name: 'เสียมขุดดิน เหล็กกล้าชุบแข็ง',
        qtyPerBundle: 1,
        componentOnHand: 68,
      },
      {
        componentVariantId: 'var_gloves_l',
        sku: 'GLV-THN-L',
        name: 'ถุงมือกันหนาม ไซส์ L',
        qtyPerBundle: 2,
        componentOnHand: 18,
      },
    ],
  },
  {
    id: 'var_bundle_water',
    productId: 'prd_bundle_water',
    sku: 'BND-WATER-SET',
    name: 'ชุดรดน้ำต้นไม้ (สายยาง+หัวฉีด)',
    kind: 'bundle',
    unit: 'ชุด',
    sellingPrice: 39900,
    lowStockThreshold: 5,
    onHand: 0,
    reserved: 0,
    avgUnitCost: 26220,
    lots: [],
    components: [
      {
        componentVariantId: 'var_hose_20',
        sku: 'HOSE-PVC-20M',
        name: 'สายยางรดน้ำ PVC 20 เมตร',
        qtyPerBundle: 1,
        componentOnHand: 7,
      },
      {
        componentVariantId: 'var_nozzle_brass',
        sku: 'NZL-BRS-01',
        name: 'หัวฉีดน้ำทองเหลือง ปรับ 8 จังหวะ',
        qtyPerBundle: 1,
        componentOnHand: 210,
      },
    ],
  },
];

/** Bundles have no stock of their own - availability comes from components. */
const bundleAvailable = (variant: MockVariant): number => {
  if (!variant.components?.length) return 0;
  return Math.min(...variant.components.map((c) => Math.floor(c.componentOnHand / c.qtyPerBundle)));
};

const toStockRow = (v: MockVariant): StockRow => {
  const onHand = v.kind === 'bundle' ? bundleAvailable(v) : v.onHand;
  return {
    variantId: v.id,
    sku: v.sku,
    name: v.name,
    kind: v.kind,
    unit: v.unit,
    onHand,
    reserved: v.reserved,
    available: Math.max(onHand - v.reserved, 0),
    sellingPrice: v.sellingPrice,
    avgUnitCost: v.avgUnitCost,
    stockValue: v.lots.reduce((sum, l) => sum + l.remainingQty * l.unitCost, 0),
    lowStockThreshold: v.lowStockThreshold,
  };
};

export const MOCK_STOCK_ROWS: StockRow[] = MOCK_VARIANTS.map(toStockRow);

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

const movementSeed: Array<
  Pick<Movement, 'reason' | 'qtyDelta' | 'channelId' | 'orderRef' | 'note'> & {
    variantId: string;
    daysAgo: number;
    hour: number;
    unitCost: number;
  }
> = [
  {
    variantId: 'var_hoe_4h',
    reason: 'sale_out',
    qtyDelta: -6,
    channelId: 'ch_shopee_main',
    orderRef: '240517ABCD1234',
    daysAgo: 0,
    hour: 9,
    unitCost: 11400,
  },
  {
    variantId: 'var_nozzle_brass',
    reason: 'sale_out',
    qtyDelta: -24,
    channelId: 'ch_tiktok_live',
    orderRef: '576230011882',
    daysAgo: 0,
    hour: 8,
    unitCost: 4910,
  },
  {
    variantId: 'var_urea_50',
    reason: 'purchase_in',
    qtyDelta: 80,
    daysAgo: 0,
    hour: 7,
    unitCost: 62840,
    note: 'รับเข้าจากสหกรณ์การเกษตร PO-2024-0514',
  },
  {
    variantId: 'var_sprayer_16',
    reason: 'sale_out',
    qtyDelta: -2,
    channelId: 'ch_lazada_main',
    orderRef: '882301774521',
    daysAgo: 1,
    hour: 14,
    unitCost: 133200,
  },
  {
    variantId: 'var_machete_12',
    reason: 'sale_out',
    qtyDelta: -12,
    channelId: 'ch_shopee_outlet',
    orderRef: '240516XYZ9911',
    daysAgo: 1,
    hour: 11,
    unitCost: 9450,
  },
  {
    variantId: 'var_hose_20',
    reason: 'adjust_out',
    qtyDelta: -3,
    daysAgo: 1,
    hour: 16,
    unitCost: 21400,
    note: 'ตรวจนับพบสายยางชำรุด 3 ม้วน',
  },
  {
    variantId: 'var_gloves_l',
    reason: 'sale_out',
    qtyDelta: -40,
    channelId: 'ch_wholesale',
    orderRef: 'WS-2024-0091',
    daysAgo: 2,
    hour: 10,
    unitCost: 3350,
  },
  {
    variantId: 'var_pruner_24',
    reason: 'return_in',
    qtyDelta: 2,
    channelId: 'ch_lazada_main',
    orderRef: '882299118273',
    daysAgo: 2,
    hour: 15,
    unitCost: 26900,
    note: 'ลูกค้าคืนสินค้า สภาพสมบูรณ์',
  },
  {
    variantId: 'var_hoe_4h',
    reason: 'cancel_restore',
    qtyDelta: 4,
    channelId: 'ch_shopee_main',
    orderRef: '240514PQRS5566',
    daysAgo: 3,
    hour: 9,
    unitCost: 10800,
    note: 'ลูกค้ายกเลิกก่อนจัดส่ง',
  },
  {
    variantId: 'var_rake_14',
    reason: 'sale_out',
    qtyDelta: -5,
    channelId: 'ch_pos_shop',
    orderRef: 'POS-2024-0451',
    daysAgo: 3,
    hour: 13,
    unitCost: 13900,
  },
  {
    variantId: 'var_spade_stl',
    reason: 'bundle_assemble',
    qtyDelta: -10,
    daysAgo: 4,
    hour: 10,
    unitCost: 15800,
    note: 'ประกอบชุดเริ่มต้นทำสวน 10 ชุด',
  },
  {
    variantId: 'var_hoe_4h',
    reason: 'bundle_assemble',
    qtyDelta: -10,
    daysAgo: 4,
    hour: 10,
    unitCost: 11400,
    note: 'ประกอบชุดเริ่มต้นทำสวน 10 ชุด',
  },
  {
    variantId: 'var_nozzle_brass',
    reason: 'purchase_in',
    qtyDelta: 150,
    daysAgo: 5,
    hour: 9,
    unitCost: 4910,
    note: 'รับเข้า PO-2024-0501',
  },
  {
    variantId: 'var_urea_50',
    reason: 'sale_out',
    qtyDelta: -18,
    channelId: 'ch_wholesale',
    orderRef: 'WS-2024-0088',
    daysAgo: 6,
    hour: 11,
    unitCost: 60800,
  },
  {
    variantId: 'var_sprayer_16',
    reason: 'transfer_out',
    qtyDelta: -4,
    daysAgo: 7,
    hour: 8,
    unitCost: 128000,
    note: 'ย้ายไปคลังสาขา 2',
  },
  {
    variantId: 'var_pruner_24',
    reason: 'purchase_in',
    qtyDelta: 30,
    daysAgo: 8,
    hour: 9,
    unitCost: 28100,
    note: 'รับเข้า PO-2024-0505',
  },
];

export const MOCK_MOVEMENTS: Movement[] = movementSeed.map((seed, index) => {
  const variant = MOCK_VARIANTS.find((v) => v.id === seed.variantId);
  const channel = MOCK_CHANNELS.find((c) => c.id === seed.channelId);
  return {
    id: `mov_${String(index + 1).padStart(4, '0')}`,
    variantId: seed.variantId,
    sku: variant?.sku ?? 'UNKNOWN',
    name: variant?.name ?? 'ไม่พบสินค้า',
    reason: seed.reason,
    qtyDelta: seed.qtyDelta,
    occurredAt: iso(seed.daysAgo, seed.hour, (index * 7) % 60),
    warehouseId: 'wh_main',
    channelId: seed.channelId,
    channelName: channel?.name,
    orderId: seed.orderRef ? `ord_${seed.orderRef}` : undefined,
    orderRef: seed.orderRef,
    note: seed.note,
    unitCost: seed.unitCost,
    totalCost: Math.abs(seed.qtyDelta) * seed.unitCost,
  };
});

// ---------------------------------------------------------------------------
// Import batches
// ---------------------------------------------------------------------------

const PREVIEW_BATCH_ID = 'imp_20240517_shopee';

let mockBatches: ImportBatch[] = [
  {
    id: PREVIEW_BATCH_ID,
    orgId: DEMO_ORG_ID,
    channelId: 'ch_shopee_main',
    channelKind: 'shopee',
    channelName: 'Shopee - เกษตรรุ่งเรือง',
    fileName: 'shopee-orders-17052024.xlsx',
    fileSize: 184320,
    status: 'preview_ready',
    detectedKind: 'shopee',
    detectionConfidence: 0.97,
    detectionReason: 'พบหัวคอลัมน์ "หมายเลขคำสั่งซื้อ" และ "เลขอ้างอิง SKU (Parent SKU)"',
    uploadedAt: iso(0, 8, 42),
    rowsRead: 128,
    ordersParsed: 46,
    linesParsed: 58,
    issueCount: 3,
    unmatchedCount: 2,
    uploadedByName: 'สมชาย (พนักงานคลัง)',
  },
  {
    id: 'imp_20240516_lazada',
    orgId: DEMO_ORG_ID,
    channelId: 'ch_lazada_main',
    channelKind: 'lazada',
    channelName: 'Lazada - เกษตรรุ่งเรือง',
    fileName: 'lazada-orders-16052024.csv',
    fileSize: 96140,
    status: 'applied',
    detectedKind: 'lazada',
    detectionConfidence: 0.99,
    detectionReason: 'พบหัวคอลัมน์ "orderNumber" และ "sellerSku"',
    uploadedAt: iso(1, 9, 12),
    appliedAt: iso(1, 9, 20),
    rowsRead: 74,
    ordersParsed: 31,
    linesParsed: 39,
    issueCount: 0,
    unmatchedCount: 0,
    uploadedByName: 'มานี (ผู้จัดการ)',
  },
  {
    id: 'imp_20240515_tiktok',
    orgId: DEMO_ORG_ID,
    channelId: 'ch_tiktok_main',
    channelKind: 'tiktok',
    channelName: 'TikTok Shop - เกษตรรุ่งเรือง',
    fileName: 'tiktok-orders-15052024.csv',
    fileSize: 51204,
    status: 'applied',
    detectedKind: 'tiktok',
    detectionConfidence: 0.95,
    detectionReason: 'พบหัวคอลัมน์ "Order ID" และ "Seller SKU"',
    uploadedAt: iso(2, 20, 15),
    appliedAt: iso(2, 20, 22),
    rowsRead: 43,
    ordersParsed: 18,
    linesParsed: 21,
    issueCount: 1,
    unmatchedCount: 0,
    uploadedByName: 'สมชาย (พนักงานคลัง)',
  },
  {
    id: 'imp_20240513_shopee_bad',
    orgId: DEMO_ORG_ID,
    channelId: 'ch_shopee_outlet',
    channelKind: 'shopee',
    channelName: 'Shopee - Outlet ลดล้างสต็อก',
    fileName: 'shopee-outlet-13052024.xlsx',
    fileSize: 12048,
    status: 'failed',
    uploadedAt: iso(4, 18, 30),
    rowsRead: 0,
    ordersParsed: 0,
    linesParsed: 0,
    issueCount: 1,
    unmatchedCount: 0,
    uploadedByName: 'สมชาย (พนักงานคลัง)',
    errorMessage: 'ไฟล์เสียหรือไม่ใช่ไฟล์ออเดอร์ของ Shopee (อ่านหัวคอลัมน์ไม่ได้)',
  },
];

const previewOrders: PreviewOrder[] = [
  {
    externalOrderId: '240517ABCD1234',
    channelKind: 'shopee',
    status: 'shipped',
    orderedAt: iso(0, 7, 15),
    shippedAt: iso(0, 9, 5),
    buyerName: 'kasem***88',
    grandTotal: 129000,
    lines: [
      {
        externalLineId: 'L1',
        platformSku: 'HOE-4H-STD',
        platformProductName: 'จอบถางหญ้า ด้ามไม้ 4 หุน',
        quantity: 6,
        unitPrice: 18500,
        discount: 2000,
        lineTotal: 109000,
        matchSource: 'sku_exact',
        variantId: 'var_hoe_4h',
        variantSku: 'HOE-4H-STD',
        variantName: 'จอบถางหญ้า ด้ามไม้ 4 หุน',
      },
      {
        externalLineId: 'L2',
        platformSku: 'nzl brs 01',
        platformProductName: 'หัวฉีดน้ำทองเหลือง 8 จังหวะ',
        quantity: 2,
        unitPrice: 8900,
        discount: 0,
        lineTotal: 17800,
        matchSource: 'sku_normalised',
        variantId: 'var_nozzle_brass',
        variantSku: 'NZL-BRS-01',
        variantName: 'หัวฉีดน้ำทองเหลือง ปรับ 8 จังหวะ',
      },
    ],
  },
  {
    externalOrderId: '240517EFGH5678',
    channelKind: 'shopee',
    status: 'shipped',
    orderedAt: iso(0, 8, 2),
    shippedAt: iso(0, 10, 12),
    buyerName: 'nong***21',
    grandTotal: 45900,
    lines: [
      {
        externalLineId: 'L1',
        platformSku: 'SET-สวน-เริ่มต้น',
        platformProductName: 'ชุดเริ่มต้นทำสวน 3 ชิ้น',
        quantity: 1,
        unitPrice: 45900,
        discount: 0,
        lineTotal: 45900,
        matchSource: 'listing_map',
        variantId: 'var_bundle_garden',
        variantSku: 'BND-GARDEN-START',
        variantName: 'ชุดเริ่มต้นทำสวน (จอบ+เสียม+ถุงมือ)',
      },
    ],
  },
  {
    externalOrderId: '240517IJKL9012',
    channelKind: 'shopee',
    status: 'confirmed',
    orderedAt: iso(0, 8, 30),
    buyerName: 'farm***07',
    grandTotal: 236800,
    lines: [
      {
        externalLineId: 'L1',
        platformSku: 'SPR-16L-BLUE',
        platformProductName: 'เครื่องพ่นยาแบตเตอรี่ 16L สีน้ำเงิน',
        quantity: 1,
        unitPrice: 189000,
        discount: 0,
        lineTotal: 189000,
        matchSource: 'unmatched',
      },
      {
        externalLineId: 'L2',
        platformSku: 'PRN-LNG-24',
        platformProductName: 'กรรไกรตัดกิ่งด้ามยาว 24 นิ้ว',
        quantity: 1,
        unitPrice: 42000,
        discount: 0,
        lineTotal: 42000,
        matchSource: 'sku_exact',
        variantId: 'var_pruner_24',
        variantSku: 'PRN-LNG-24',
        variantName: 'กรรไกรตัดกิ่ง ด้ามยาว 24 นิ้ว',
      },
      {
        externalLineId: 'L3',
        platformSku: 'GLOVE-THORN-L',
        platformProductName: 'ถุงมือกันหนาม L',
        quantity: 1,
        unitPrice: 6500,
        discount: 700,
        lineTotal: 5800,
        matchSource: 'unmatched',
      },
    ],
  },
  {
    externalOrderId: '240516MNOP3456',
    channelKind: 'shopee',
    status: 'cancelled',
    orderedAt: iso(1, 19, 40),
    buyerName: 'ploy***55',
    grandTotal: 78000,
    lines: [
      {
        externalLineId: 'L1',
        platformSku: 'FRT-UREA-50',
        platformProductName: 'ปุ๋ยยูเรีย 46-0-0 50กก.',
        quantity: 1,
        unitPrice: 78000,
        discount: 0,
        lineTotal: 78000,
        matchSource: 'sku_exact',
        variantId: 'var_urea_50',
        variantSku: 'FRT-UREA-50',
        variantName: 'ปุ๋ยยูเรีย 46-0-0 ขนาด 50 กก.',
      },
    ],
  },
];

let mockUnmatched: UnmatchedSku[] = [
  {
    platformSku: 'SPR-16L-BLUE',
    platformProductName: 'เครื่องพ่นยาแบตเตอรี่ 16L สีน้ำเงิน',
    occurrences: 3,
    quantity: 4,
    suggestions: [
      {
        variantId: 'var_sprayer_16',
        sku: 'SPR-BAT-16L',
        name: 'เครื่องพ่นยา แบตเตอรี่ 16 ลิตร',
        score: 0.82,
      },
      {
        variantId: 'var_pruner_24',
        sku: 'PRN-LNG-24',
        name: 'กรรไกรตัดกิ่ง ด้ามยาว 24 นิ้ว',
        score: 0.21,
      },
    ],
  },
  {
    platformSku: 'GLOVE-THORN-L',
    platformProductName: 'ถุงมือกันหนาม L',
    occurrences: 1,
    quantity: 1,
    suggestions: [
      { variantId: 'var_gloves_l', sku: 'GLV-THN-L', name: 'ถุงมือกันหนาม ไซส์ L', score: 0.74 },
    ],
  },
];

const previewIssues: ImportDetailResponse['issues'] = [
  {
    severity: 'warning',
    row: 19,
    column: 'ชื่อตัวเลือก',
    code: 'variation_ignored',
    message: 'ไม่พบตัวเลือกสินค้า "สีน้ำเงิน" ในระบบ ใช้สินค้าหลักแทน',
  },
  {
    severity: 'warning',
    row: 44,
    column: 'จำนวน',
    code: 'quantity_zero',
    message: 'จำนวนเป็น 0 ข้ามแถวนี้',
  },
  {
    severity: 'error',
    row: 91,
    column: 'ราคาขาย',
    code: 'price_unparsable',
    message: 'อ่านราคาไม่ได้ ("-") ระบบบันทึกเป็น 0 บาท',
  },
];

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const orderSeed: Array<[string, string, Order['status'], string, number, number, number]> = [
  ['240517ABCD1234', 'ch_shopee_main', 'shipped', 'kasem***88', 129000, 2, 78240],
  ['240517EFGH5678', 'ch_shopee_main', 'shipped', 'nong***21', 45900, 1, 30230],
  ['240517IJKL9012', 'ch_shopee_main', 'confirmed', 'farm***07', 236800, 3, 164550],
  ['882301774521', 'ch_lazada_main', 'delivered', 'suda***12', 378000, 1, 266400],
  ['576230011882', 'ch_tiktok_live', 'shipped', 'tiktokbuyer***9', 213600, 1, 117840],
  ['POS-2024-0451', 'ch_pos_shop', 'delivered', 'ลูกค้าหน้าร้าน', 107500, 1, 69500],
  ['WS-2024-0091', 'ch_wholesale', 'delivered', 'ร้านเกษตรบ้านนา', 260000, 1, 134000],
  ['240516MNOP3456', 'ch_shopee_main', 'cancelled', 'ploy***55', 78000, 1, 0],
  ['882299118273', 'ch_lazada_main', 'returned', 'chai***33', 84000, 1, 53800],
  ['240515QRST7788', 'ch_shopee_outlet', 'delivered', 'mali***02', 190800, 2, 113400],
];

let mockOrders: Order[] = orderSeed.map(
  ([ref, channelId, status, customer, grandTotal, lineCount, cogs], index) => {
    const channel = MOCK_CHANNELS.find((c) => c.id === channelId);
    // Split the bill evenly over its lines so the line totals sum back to the
    // grand total exactly; the first line absorbs the rounding remainder.
    const share = Math.floor(grandTotal / lineCount);
    const firstShare = grandTotal - share * (lineCount - 1);
    const costShare = Math.floor(cogs / lineCount);
    const firstCostShare = cogs - costShare * (lineCount - 1);
    const lines: OrderLine[] = Array.from({ length: lineCount }, (_, lineIndex) => {
      const variant = MOCK_VARIANTS[(index + lineIndex * 3) % MOCK_VARIANTS.length];
      if (!variant) throw new Error('demo fixtures must keep at least one variant');
      const lineTotal = lineIndex === 0 ? firstShare : share;
      const totalCost = lineIndex === 0 ? firstCostShare : costShare;
      return {
        id: `oln_${ref}_${lineIndex + 1}`,
        variantId: variant.id,
        sku: variant.sku,
        name: variant.name,
        quantity: 1,
        unitPrice: lineTotal,
        discount: 0,
        lineTotal,
        unitCost: totalCost,
        totalCost,
      };
    });
    return {
      id: `ord_${ref}`,
      orgId: DEMO_ORG_ID,
      channelId,
      channelName: channel?.name ?? 'ไม่ทราบช่องทาง',
      channelKind: channel?.kind ?? 'manual',
      // Every bill carries its number here now, manual ones included.
      externalOrderId: ref,
      status,
      customerName: customer,
      orderedAt: iso(Math.floor(index / 3), 10 + (index % 8), (index * 11) % 60),
      grandTotal,
      cogs,
      margin: grandTotal - cogs,
      lines,
    };
  },
);

// ---------------------------------------------------------------------------
// COGS report
// ---------------------------------------------------------------------------

/** [variantId, qtySold, revenue (satang), cogs (satang)] */
type CogsSeed = [string, number, number, number];

const COGS_SEED: CogsSeed[] = [
  ['var_hoe_4h', 86, 1_591_000, 962_400],
  ['var_nozzle_brass', 240, 2_136_000, 1_172_400],
  ['var_urea_50', 62, 4_836_000, 3_875_000],
  ['var_sprayer_16', 9, 1_701_000, 1_192_500],
  ['var_machete_12', 44, 699_600, 415_800],
  ['var_pruner_24', 12, 504_000, 333_600],
  ['var_gloves_l', 120, 780_000, 402_000],
];

const cogsRows: CogsReportRow[] = COGS_SEED.map(([variantId, qtySold, revenue, cogs]) => {
  const variant = MOCK_VARIANTS.find((v) => v.id === variantId);
  const grossProfit = revenue - cogs;
  return {
    variantId,
    sku: variant?.sku ?? 'UNKNOWN',
    name: variant?.name ?? 'ไม่พบสินค้า',
    qtySold,
    revenue,
    cogs,
    grossProfit,
    marginPct: Number(((grossProfit / revenue) * 100).toFixed(1)),
  };
});

// ---------------------------------------------------------------------------
// Sample import file - powers the "ใช้ไฟล์ตัวอย่าง" button on /imports/new
// ---------------------------------------------------------------------------

const SAMPLE_SHOPEE_CSV = [
  'หมายเลขคำสั่งซื้อ,สถานะการสั่งซื้อ,เวลาการสั่งซื้อ,ชื่อผู้ใช้ (ผู้ซื้อ),เลขอ้างอิง SKU (Parent SKU),ชื่อสินค้า,ชื่อตัวเลือก,จำนวน,ราคาขาย,ส่วนลดจากผู้ขาย',
  '240517ABCD1234,จัดส่งแล้ว,2024-05-17 07:15,kasem***88,HOE-4H-STD,จอบถางหญ้า ด้ามไม้ 4 หุน,,6,185.00,20.00',
  '240517ABCD1234,จัดส่งแล้ว,2024-05-17 07:15,kasem***88,nzl brs 01,หัวฉีดน้ำทองเหลือง 8 จังหวะ,,2,89.00,0.00',
  '240517EFGH5678,จัดส่งแล้ว,2024-05-17 08:02,nong***21,SET-สวน-เริ่มต้น,ชุดเริ่มต้นทำสวน 3 ชิ้น,,1,459.00,0.00',
  '240517IJKL9012,รอจัดส่ง,2024-05-17 08:30,farm***07,SPR-16L-BLUE,เครื่องพ่นยาแบตเตอรี่ 16L,สีน้ำเงิน,1,1890.00,0.00',
  '240517IJKL9012,รอจัดส่ง,2024-05-17 08:30,farm***07,PRN-LNG-24,กรรไกรตัดกิ่งด้ามยาว 24 นิ้ว,,1,420.00,0.00',
  '240517IJKL9012,รอจัดส่ง,2024-05-17 08:30,farm***07,GLOVE-THORN-L,ถุงมือกันหนาม L,,1,65.00,7.00',
  '240516MNOP3456,ยกเลิก,2024-05-16 19:40,ploy***55,FRT-UREA-50,ปุ๋ยยูเรีย 46-0-0 50กก.,,1,780.00,0.00',
].join('\n');

/** Builds a real File object in the browser so the dropzone flow is identical. */
export const buildSampleImportFile = (): File =>
  new File([`\uFEFF${SAMPLE_SHOPEE_CSV}`], 'ตัวอย่าง-shopee-orders.csv', {
    type: 'text/csv',
  });

// ---------------------------------------------------------------------------
// The fake API. Method names mirror api-client.ts one to one.
// ---------------------------------------------------------------------------

const notFound = (what: string) => new ApiError('not_found', `ไม่พบ${what}`, 404);

const paginate = <T>(items: T[], limit = 50): { items: T[]; nextCursor: string | null } => ({
  items: items.slice(0, limit),
  nextCursor: items.length > limit ? `cursor_${limit}` : null,
});

export const mockApi = {
  health: (): HealthResponse => ({
    status: 'ok',
    version: '0.0.0-demo',
    time: new Date().toISOString(),
  }),

  me: (): MeResponse => {
    const { role, userId } = getDemoIdentity();
    const names: Record<string, string> = {
      owner: 'คุณวิชัย (เจ้าของกิจการ)',
      manager: 'คุณมานี (ผู้จัดการ)',
      stock_staff: 'คุณสมชาย (พนักงานคลัง)',
      sales: 'คุณน้ำฝน (พนักงานขาย)',
    };
    return {
      user: { id: userId, name: names[role] ?? 'ผู้ใช้เดโม', email: `${role}@demo.stockhub.local` },
      role,
      // permissionsOf() from @stockhub/core is the single source of truth.
      permissions: [...permissionsOf(role)],
    };
  },

  channels: (): Channel[] => MOCK_CHANNELS,

  dashboardSummary: (): DashboardSummary => {
    const rows = MOCK_STOCK_ROWS;
    const summary: DashboardSummary = {
      totalSkus: rows.length,
      totalOnHand: rows.reduce((sum, r) => sum + r.onHand, 0),
      lowStockCount: rows.filter((r) => r.onHand <= r.lowStockThreshold).length,
      stockValue: rows.reduce((sum, r) => sum + (r.stockValue ?? 0), 0),
      todaySold: 32,
      pendingImports: mockBatches.filter((b) => b.status === 'preview_ready').length,
      unmatchedSkus: mockUnmatched.length,
      byChannel: MOCK_CHANNELS.map((channel, index) => ({
        channelId: channel.id,
        kind: channel.kind,
        name: channel.name,
        unitsSoldToday: [12, 4, 7, 2, 5, 2, 8, 3][index] ?? 0,
        revenueToday: 553_200 - index * 61_000,
      })),
    };
    return gate(summary);
  },

  inventory: (query: InventoryQuery = {}): InventoryResponse => {
    const q = query.q?.trim().toLowerCase();
    let rows = MOCK_STOCK_ROWS;
    if (q) {
      rows = rows.filter(
        (r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
      );
    }
    if (query.lowStock) rows = rows.filter((r) => r.onHand <= r.lowStockThreshold);
    // channelId is accepted for contract parity; the mock has no per-channel split.
    return gate(paginate(rows, query.limit ?? 50));
  },

  variant: (variantId: string): VariantDetailResponse => {
    const variant = MOCK_VARIANTS.find((v) => v.id === variantId || v.sku === variantId);
    if (!variant) throw notFound('สินค้า');
    const onHand = variant.kind === 'bundle' ? bundleAvailable(variant) : variant.onHand;
    const detail: VariantDetailResponse = {
      variant: {
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        name: variant.name,
        kind: variant.kind,
        unit: variant.unit,
        sellingPrice: variant.sellingPrice,
        lowStockThreshold: variant.lowStockThreshold,
        barcode: variant.barcode,
        components: variant.components,
      },
      onHand,
      reserved: variant.reserved,
      available: Math.max(onHand - variant.reserved, 0),
      lots: variant.lots,
    };
    return gate(detail);
  },

  movements: (query: MovementsQuery = {}): MovementsResponse => {
    let rows = [...MOCK_MOVEMENTS];
    if (query.variantId) rows = rows.filter((m) => m.variantId === query.variantId);
    if (query.reason) rows = rows.filter((m) => m.reason === query.reason);
    const from = query.from;
    const to = query.to;
    if (from) rows = rows.filter((m) => m.occurredAt >= from);
    if (to) rows = rows.filter((m) => m.occurredAt <= `${to}T23:59:59.999Z`);
    rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return gate(paginate(rows, query.limit ?? 50));
  },

  imports: (): ImportBatch[] =>
    [...mockBatches].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),

  createImport: (fileName: string, fileSize: number, channelId?: string): ImportBatch => {
    const channel = MOCK_CHANNELS.find((c) => c.id === channelId);
    const batch: ImportBatch = {
      id: `imp_${Date.now()}`,
      orgId: DEMO_ORG_ID,
      channelId: channel?.id,
      channelKind: channel?.kind,
      channelName: channel?.name,
      fileName,
      fileSize,
      status: 'preview_ready',
      detectedKind: channel?.kind ?? 'shopee',
      detectionConfidence: 0.97,
      detectionReason: 'พบหัวคอลัมน์ "หมายเลขคำสั่งซื้อ" และ "เลขอ้างอิง SKU (Parent SKU)"',
      uploadedAt: new Date().toISOString(),
      rowsRead: 128,
      ordersParsed: previewOrders.length,
      linesParsed: previewOrders.reduce((sum, o) => sum + o.lines.length, 0),
      issueCount: previewIssues.length,
      unmatchedCount: mockUnmatched.length,
      uploadedByName: 'ผู้ใช้เดโม',
    };
    mockBatches = [batch, ...mockBatches];
    return batch;
  },

  importDetail: (id: string): ImportDetailResponse => {
    const batch = mockBatches.find((b) => b.id === id) ?? mockBatches[0];
    if (!batch) throw notFound('ไฟล์นำเข้า');
    // Applied and failed batches have no preview payload left to show.
    const showPreview = batch.status === 'preview_ready' || batch.status === 'uploaded';
    return {
      batch,
      orders: showPreview ? previewOrders : [],
      issues: showPreview ? previewIssues : [],
      unmatched: showPreview ? mockUnmatched : [],
    };
  },

  matchImportSku: (id: string, input: MatchSkuInput): MatchSkuResult => {
    const target = mockUnmatched.find((u) => u.platformSku === input.platformSku);
    const variant = MOCK_VARIANTS.find((v) => v.id === input.variantId);
    if (!target || !variant) throw notFound('SKU ที่ต้องจับคู่');

    // Mirror the server: the mapping is saved, so the lines flip to matched.
    for (const order of previewOrders) {
      for (const line of order.lines) {
        if (line.platformSku !== input.platformSku) continue;
        line.matchSource = 'manual';
        line.variantId = variant.id;
        line.variantSku = variant.sku;
        line.variantName = variant.name;
      }
    }
    mockUnmatched = mockUnmatched.filter((u) => u.platformSku !== input.platformSku);
    const batch = mockBatches.find((b) => b.id === id);
    if (batch) batch.unmatchedCount = mockUnmatched.length;

    return {
      platformSku: input.platformSku,
      variantId: variant.id,
      linesUpdated: target.occurrences,
    };
  },

  applyImport: (id: string): ApplyImportResult => {
    const batch = mockBatches.find((b) => b.id === id);
    if (!batch) throw notFound('ไฟล์นำเข้า');
    if (mockUnmatched.length > 0) {
      throw new ApiError(
        'unmatched_sku',
        `ยังมี SKU ที่จับคู่ไม่ได้ ${mockUnmatched.length} รายการ กรุณาจับคู่ให้ครบก่อนยืนยัน`,
        422,
        { unmatched: mockUnmatched.map((u) => u.platformSku) },
      );
    }
    batch.status = 'applied';
    batch.appliedAt = new Date().toISOString();
    return gate({
      movementsCreated: batch.linesParsed,
      ordersApplied: batch.ordersParsed,
      cogs: 486_200,
    });
  },

  orders: (query: OrdersQuery = {}): OrdersResponse => {
    let rows = [...mockOrders];
    if (query.channelId) rows = rows.filter((o) => o.channelId === query.channelId);
    if (query.status) rows = rows.filter((o) => o.status === query.status);
    rows.sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
    return gate(paginate(rows, query.limit ?? 50));
  },

  createOrder: (input: CreateOrderInput): Order => {
    const channel = MOCK_CHANNELS.find((c) => c.kind === input.channelKind);
    if (!channel) throw notFound('ช่องทางขาย');
    if (input.lines.length === 0) {
      throw new ApiError('validation_error', 'ต้องมีสินค้าอย่างน้อย 1 รายการ', 400);
    }

    const lines = input.lines.map((line, index) => {
      const variant = MOCK_VARIANTS.find((v) => v.id === line.variantId);
      if (!variant) throw notFound(`สินค้า ${line.variantId}`);
      const unitPrice = line.unitPrice ?? variant.sellingPrice;
      const discount = line.discount ?? 0;
      return {
        id: `oln_${index + 1}`,
        variantId: variant.id,
        sku: variant.sku,
        name: variant.name,
        quantity: line.quantity,
        unitPrice,
        discount,
        lineTotal: unitPrice * line.quantity - discount,
        unitCost: variant.avgUnitCost,
        totalCost: variant.avgUnitCost * line.quantity,
      };
    });

    // A local bill number in the same shape the API generates for manual channels.
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const serial = Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, '0');
    const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const cogs = lines.reduce((sum, l) => sum + (l.totalCost ?? 0), 0);

    const order: Order = {
      id: `ord_${input.channelKind.toUpperCase()}_${Date.now()}`,
      orgId: DEMO_ORG_ID,
      channelId: channel.id,
      channelName: channel.name,
      channelKind: channel.kind,
      externalOrderId: `POS-${stamp}-${serial}`,
      status: 'delivered',
      customerName: input.customerName ?? 'ลูกค้าหน้าร้าน',
      orderedAt: new Date().toISOString(),
      grandTotal,
      cogs,
      margin: grandTotal - cogs,
      lines,
    };
    mockOrders = [order, ...mockOrders];
    return gate(order);
  },

  receiveStock: (input: ReceiveStockInput): Movement => {
    const variant = MOCK_VARIANTS.find((v) => v.id === input.variantId);
    if (!variant) throw notFound('สินค้า');
    return {
      id: `mov_${Date.now()}`,
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      reason: 'purchase_in',
      qtyDelta: input.qty,
      // Demo stock never persists, so the balance is simply onHand + this receipt.
      qtyAfter: variant.onHand + input.qty,
      occurredAt: input.receivedAt ?? new Date().toISOString(),
      warehouseId: 'wh_main',
      note: input.note ?? (input.reference ? `รับเข้า ${input.reference}` : undefined),
      unitCost: input.unitCost,
      totalCost: input.unitCost * input.qty,
    };
  },

  // FIFO restore runs server side; the demo has no cancel / return screen yet,
  // so these only need to answer with the same shape the API would.
  cancelOrder: (_id: string, _reason: string): Movement[] => [],
  returnOrder: (_id: string, _lines: ReturnOrderLineInput[]): Movement[] => [],

  cogsReport: (query: CogsQuery = {}): CogsReportResponse => {
    const { role } = getDemoIdentity();
    // The real API returns 403 here; the mock must behave the same way so the
    // "sales cannot open the cost report" moment of the demo is honest.
    if (!can(role, 'cost:read')) {
      throw new ApiError('forbidden', 'ไม่มีสิทธิ์ดูรายงานต้นทุน (ต้องการสิทธิ์ cost:read)', 403, {
        permission: 'cost:read',
      });
    }
    const totalRevenue = cogsRows.reduce((sum, r) => sum + r.revenue, 0);
    const totalCogs = cogsRows.reduce((sum, r) => sum + r.cogs, 0);
    const grossProfit = totalRevenue - totalCogs;
    return {
      from: query.from ?? iso(30).slice(0, 10),
      to: query.to ?? iso(0).slice(0, 10),
      totalRevenue,
      totalCogs,
      grossProfit,
      marginPct: Number(((grossProfit / totalRevenue) * 100).toFixed(1)),
      rows: cogsRows,
    };
  },
};

export type MockApi = typeof mockApi;
