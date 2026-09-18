/**
 * Demo data for a Thai agricultural tool shop.
 *
 * Every id is a hard coded uuid so the seed is deterministic: re-running it
 * produces the exact same ids, which means the web app can deep link to a demo
 * product and screenshots stay valid. Real rows get their id from
 * `gen_random_uuid()` - see src/schema/_shared.ts.
 *
 * Money is written with `fromBaht()` so the numbers below read like a price
 * list while the database still stores integer satang.
 *
 * The data is shaped to make the demo interesting, not just to fill tables:
 *   - 8 channels (6 online shops + POS + wholesale) share ONE stock pool
 *   - 2 bundles (สินค้าชุด) that own no stock and borrow it from components
 *   - most variants have 2 or 3 purchase lots at DIFFERENT costs, so the first
 *     FIFO sale visibly eats the cheap layer first
 *   - one import batch parked in `preview_ready` with an unmatched order line,
 *     which is the screen that sells the product
 */

import { fromBaht } from '@stockhub/core';
import type {
  NewBundleComponent,
  NewChannel,
  NewChannelListing,
  NewCustomer,
  NewImportBatch,
  NewOrder,
  NewOrderLine,
  NewOrganization,
  NewPriceTier,
  NewPriceTierPrice,
  NewProduct,
  NewUser,
  NewVariant,
  NewWarehouse,
} from '../schema';

/** Stable ids. Import these in tests and in the web app demo fixtures. */
export const SEED_IDS = {
  org: '0a000000-0000-4000-8000-000000000001',
  warehouse: '0c000000-0000-4000-8000-000000000001',
  users: {
    owner: '0b000000-0000-4000-8000-000000000001',
    manager: '0b000000-0000-4000-8000-000000000002',
    stock: '0b000000-0000-4000-8000-000000000003',
    sales: '0b000000-0000-4000-8000-000000000004',
  },
  channels: {
    shopeeMain: '0d000000-0000-4000-8000-000000000001',
    shopeeBranch: '0d000000-0000-4000-8000-000000000002',
    lazadaMain: '0d000000-0000-4000-8000-000000000003',
    lazadaMall: '0d000000-0000-4000-8000-000000000004',
    tiktokMain: '0d000000-0000-4000-8000-000000000005',
    tiktokLive: '0d000000-0000-4000-8000-000000000006',
    pos: '0d000000-0000-4000-8000-000000000007',
    wholesale: '0d000000-0000-4000-8000-000000000008',
  },
  products: {
    hoe: '0e000000-0000-4000-8000-000000000001',
    spade: '0e000000-0000-4000-8000-000000000002',
    machete: '0e000000-0000-4000-8000-000000000003',
    pruner: '0e000000-0000-4000-8000-000000000004',
    mower: '0e000000-0000-4000-8000-000000000005',
    blade: '0e000000-0000-4000-8000-000000000006',
    hose: '0e000000-0000-4000-8000-000000000007',
    nozzle: '0e000000-0000-4000-8000-000000000008',
    conn: '0e000000-0000-4000-8000-000000000009',
    fertChem: '0e000000-0000-4000-8000-000000000010',
    fertOrg: '0e000000-0000-4000-8000-000000000011',
    sprayer: '0e000000-0000-4000-8000-000000000012',
    glove: '0e000000-0000-4000-8000-000000000013',
    hat: '0e000000-0000-4000-8000-000000000014',
    waterCan: '0e000000-0000-4000-8000-000000000015',
    bundleWater: '0e000000-0000-4000-8000-000000000016',
    bundleMow: '0e000000-0000-4000-8000-000000000017',
  },
  variants: {
    hoe: '0f000000-0000-4000-8000-000000000001',
    spade: '0f000000-0000-4000-8000-000000000002',
    machete: '0f000000-0000-4000-8000-000000000003',
    pruner: '0f000000-0000-4000-8000-000000000004',
    mower: '0f000000-0000-4000-8000-000000000005',
    blade: '0f000000-0000-4000-8000-000000000006',
    hose: '0f000000-0000-4000-8000-000000000007',
    nozzle: '0f000000-0000-4000-8000-000000000008',
    conn: '0f000000-0000-4000-8000-000000000009',
    fert50: '0f000000-0000-4000-8000-000000000010',
    fert25: '0f000000-0000-4000-8000-000000000011',
    fertOrg: '0f000000-0000-4000-8000-000000000012',
    sprayer: '0f000000-0000-4000-8000-000000000013',
    glove: '0f000000-0000-4000-8000-000000000014',
    hat: '0f000000-0000-4000-8000-000000000015',
    waterCan: '0f000000-0000-4000-8000-000000000016',
    bundleWater: '0f000000-0000-4000-8000-000000000017',
    bundleMow: '0f000000-0000-4000-8000-000000000018',
  },
  importBatch: '16000000-0000-4000-8000-000000000001',
  priceTiers: {
    retail: '17000000-0000-4000-8000-000000000001',
    wholesale: '17000000-0000-4000-8000-000000000002',
    dealer: '17000000-0000-4000-8000-000000000003',
  },
  customers: {
    walkIn: '18000000-0000-4000-8000-000000000001',
    farmShopA: '18000000-0000-4000-8000-000000000002',
    farmShopB: '18000000-0000-4000-8000-000000000003',
    coop: '18000000-0000-4000-8000-000000000004',
    dealerNorth: '18000000-0000-4000-8000-000000000005',
  },
  orders: {
    shopeeA: '13000000-0000-4000-8000-000000000001',
    lazadaB: '13000000-0000-4000-8000-000000000002',
    tiktokCancelled: '13000000-0000-4000-8000-000000000003',
    posWalkIn: '13000000-0000-4000-8000-000000000004',
  },
} as const;

/** Bangkok wall clock -> Date. The shop reads every report in +07:00. */
const bkk = (isoLocal: string): Date => new Date(`${isoLocal}+07:00`);

export const SEED_ORG: NewOrganization = {
  id: SEED_IDS.org,
  name: 'ร้านเกษตรรุ่งเรือง',
  slug: 'kaset-rungrueang',
  timeZone: 'Asia/Bangkok',
};

/**
 * One user per role. The demo header switches between them to show cost data
 * appearing and disappearing. Passwords do not exist yet - auth is out of scope
 * for the template, see HANDOFF.md.
 */
export const SEED_USERS: NewUser[] = [
  {
    id: SEED_IDS.users.owner,
    orgId: SEED_IDS.org,
    email: 'somchai@example.test',
    fullName: 'สมชาย เจ้าของร้าน',
    role: 'owner',
  },
  {
    id: SEED_IDS.users.manager,
    orgId: SEED_IDS.org,
    email: 'pranee@example.test',
    fullName: 'ปราณี ผู้จัดการ',
    role: 'manager',
  },
  {
    id: SEED_IDS.users.stock,
    orgId: SEED_IDS.org,
    email: 'wichai@example.test',
    fullName: 'วิชัย พนักงานคลัง',
    role: 'stock_staff',
  },
  {
    id: SEED_IDS.users.sales,
    orgId: SEED_IDS.org,
    email: 'malee@example.test',
    fullName: 'มาลี พนักงานขาย',
    role: 'sales',
  },
];

export const SEED_WAREHOUSES: NewWarehouse[] = [
  {
    id: SEED_IDS.warehouse,
    orgId: SEED_IDS.org,
    name: 'คลังหลัก (หลังร้าน)',
    code: 'MAIN',
    isDefault: true,
  },
];

/** 6 online shops + the till + the wholesale desk, all on one stock pool. */
export const SEED_CHANNELS: NewChannel[] = [
  {
    id: SEED_IDS.channels.shopeeMain,
    orgId: SEED_IDS.org,
    kind: 'shopee',
    name: 'Shopee - ร้านหลัก',
    externalShopId: 'shp-100001',
  },
  {
    id: SEED_IDS.channels.shopeeBranch,
    orgId: SEED_IDS.org,
    kind: 'shopee',
    name: 'Shopee - ร้านสาขา 2',
    externalShopId: 'shp-100002',
  },
  {
    id: SEED_IDS.channels.lazadaMain,
    orgId: SEED_IDS.org,
    kind: 'lazada',
    name: 'Lazada - ร้านหลัก',
    externalShopId: 'lzd-200001',
  },
  {
    id: SEED_IDS.channels.lazadaMall,
    orgId: SEED_IDS.org,
    kind: 'lazada',
    name: 'Lazada - LazMall',
    externalShopId: 'lzd-200002',
  },
  {
    id: SEED_IDS.channels.tiktokMain,
    orgId: SEED_IDS.org,
    kind: 'tiktok',
    name: 'TikTok Shop - ร้านหลัก',
    externalShopId: 'tts-300001',
  },
  {
    id: SEED_IDS.channels.tiktokLive,
    orgId: SEED_IDS.org,
    kind: 'tiktok',
    name: 'TikTok Shop - ไลฟ์สด',
    externalShopId: 'tts-300002',
  },
  {
    id: SEED_IDS.channels.pos,
    orgId: SEED_IDS.org,
    kind: 'pos',
    name: 'หน้าร้าน (POS)',
    externalShopId: undefined,
  },
  {
    id: SEED_IDS.channels.wholesale,
    orgId: SEED_IDS.org,
    kind: 'wholesale',
    name: 'ขายส่ง / เครดิตร้านค้า',
    externalShopId: undefined,
  },
];

export const SEED_PRODUCTS: NewProduct[] = [
  {
    id: SEED_IDS.products.hoe,
    orgId: SEED_IDS.org,
    name: 'จอบขุดดิน ด้ามไม้',
    category: 'เครื่องมือเกษตร',
  },
  {
    id: SEED_IDS.products.spade,
    orgId: SEED_IDS.org,
    name: 'เสียมปลายแหลม',
    category: 'เครื่องมือเกษตร',
  },
  {
    id: SEED_IDS.products.machete,
    orgId: SEED_IDS.org,
    name: 'มีดพร้าฟันหญ้า',
    category: 'เครื่องมือเกษตร',
  },
  {
    id: SEED_IDS.products.pruner,
    orgId: SEED_IDS.org,
    name: 'กรรไกรตัดกิ่งไม้',
    category: 'เครื่องมือเกษตร',
  },
  {
    id: SEED_IDS.products.mower,
    orgId: SEED_IDS.org,
    name: 'เครื่องตัดหญ้าสะพายบ่า 2 จังหวะ',
    category: 'เครื่องจักรกลเกษตร',
  },
  {
    id: SEED_IDS.products.blade,
    orgId: SEED_IDS.org,
    name: 'ใบมีดตัดหญ้า 3 ฟัน ขนาด 10 นิ้ว',
    category: 'อะไหล่และใบมีด',
  },
  {
    id: SEED_IDS.products.hose,
    orgId: SEED_IDS.org,
    name: 'สายยางรดน้ำ 5 หุน ยาว 20 เมตร',
    category: 'ระบบน้ำ',
  },
  {
    id: SEED_IDS.products.nozzle,
    orgId: SEED_IDS.org,
    name: 'หัวฉีดน้ำทองเหลือง',
    category: 'ระบบน้ำ',
  },
  {
    id: SEED_IDS.products.conn,
    orgId: SEED_IDS.org,
    name: 'ข้อต่อสายยาง 3/4 นิ้ว',
    category: 'ระบบน้ำ',
  },
  {
    id: SEED_IDS.products.fertChem,
    orgId: SEED_IDS.org,
    name: 'ปุ๋ยเคมี สูตร 16-16-16',
    category: 'ปุ๋ยและยา',
  },
  {
    id: SEED_IDS.products.fertOrg,
    orgId: SEED_IDS.org,
    name: 'ปุ๋ยอินทรีย์อัดเม็ด 25 กก.',
    category: 'ปุ๋ยและยา',
  },
  {
    id: SEED_IDS.products.sprayer,
    orgId: SEED_IDS.org,
    name: 'ถังพ่นยาสะพายหลัง 16 ลิตร',
    category: 'อุปกรณ์พ่นยา',
  },
  {
    id: SEED_IDS.products.glove,
    orgId: SEED_IDS.org,
    name: 'ถุงมือทำสวนเคลือบยาง',
    category: 'อุปกรณ์นิรภัย',
  },
  {
    id: SEED_IDS.products.hat,
    orgId: SEED_IDS.org,
    name: 'หมวกชาวไร่ปีกกว้าง',
    category: 'อุปกรณ์นิรภัย',
  },
  {
    id: SEED_IDS.products.waterCan,
    orgId: SEED_IDS.org,
    name: 'บัวรดน้ำพลาสติก 10 ลิตร',
    category: 'ระบบน้ำ',
  },
  {
    id: SEED_IDS.products.bundleWater,
    orgId: SEED_IDS.org,
    name: 'ชุดรดน้ำต้นไม้ครบชุด (สินค้าชุด)',
    category: 'สินค้าชุด',
  },
  {
    id: SEED_IDS.products.bundleMow,
    orgId: SEED_IDS.org,
    name: 'ชุดเริ่มต้นตัดหญ้า (สินค้าชุด)',
    category: 'สินค้าชุด',
  },
];

/**
 * Variants hold the SKU, the price and (for simple ones) the stock.
 * `BDL-*` are bundles: kind 'bundle', no lots of their own.
 */
export const SEED_VARIANTS: NewVariant[] = [
  {
    id: SEED_IDS.variants.hoe,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.hoe,
    sku: 'HOE-001',
    name: undefined,
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: fromBaht(185),
    reorderPoint: 10,
  },
  {
    id: SEED_IDS.variants.spade,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.spade,
    sku: 'SPD-001',
    name: undefined,
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: fromBaht(165),
    reorderPoint: 10,
  },
  {
    id: SEED_IDS.variants.machete,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.machete,
    sku: 'KNF-001',
    name: undefined,
    kind: 'simple',
    unit: 'เล่ม',
    sellingPrice: fromBaht(240),
    reorderPoint: 8,
  },
  {
    id: SEED_IDS.variants.pruner,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.pruner,
    sku: 'PRN-001',
    name: undefined,
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: fromBaht(320),
    reorderPoint: 6,
  },
  {
    id: SEED_IDS.variants.mower,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.mower,
    sku: 'MWR-2T-430',
    name: undefined,
    kind: 'simple',
    unit: 'เครื่อง',
    sellingPrice: fromBaht(4390),
    reorderPoint: 3,
  },
  {
    id: SEED_IDS.variants.blade,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.blade,
    sku: 'BLD-3T-255',
    name: undefined,
    kind: 'simple',
    unit: 'ใบ',
    sellingPrice: fromBaht(95),
    reorderPoint: 30,
  },
  {
    id: SEED_IDS.variants.hose,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.hose,
    sku: 'HOS-20M',
    name: undefined,
    kind: 'simple',
    unit: 'ม้วน',
    sellingPrice: fromBaht(450),
    reorderPoint: 10,
  },
  {
    id: SEED_IDS.variants.nozzle,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.nozzle,
    sku: 'NZL-BRS',
    name: undefined,
    kind: 'simple',
    unit: 'ชิ้น',
    sellingPrice: fromBaht(135),
    reorderPoint: 15,
  },
  {
    id: SEED_IDS.variants.conn,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.conn,
    sku: 'CON-34',
    name: undefined,
    kind: 'simple',
    unit: 'ชิ้น',
    sellingPrice: fromBaht(45),
    reorderPoint: 40,
  },
  {
    id: SEED_IDS.variants.fert50,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.fertChem,
    sku: 'FRT-161616-50',
    name: 'ขนาด 50 กก.',
    kind: 'simple',
    unit: 'กระสอบ',
    sellingPrice: fromBaht(980),
    reorderPoint: 15,
  },
  {
    id: SEED_IDS.variants.fert25,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.fertChem,
    sku: 'FRT-161616-25',
    name: 'ขนาด 25 กก.',
    kind: 'simple',
    unit: 'กระสอบ',
    sellingPrice: fromBaht(520),
    reorderPoint: 15,
  },
  {
    id: SEED_IDS.variants.fertOrg,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.fertOrg,
    sku: 'FRT-ORG-25',
    name: undefined,
    kind: 'simple',
    unit: 'กระสอบ',
    sellingPrice: fromBaht(350),
    reorderPoint: 20,
  },
  {
    id: SEED_IDS.variants.sprayer,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.sprayer,
    sku: 'SPR-16L',
    name: undefined,
    kind: 'simple',
    unit: 'ใบ',
    sellingPrice: fromBaht(890),
    reorderPoint: 5,
  },
  {
    id: SEED_IDS.variants.glove,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.glove,
    sku: 'GLV-01',
    name: undefined,
    kind: 'simple',
    unit: 'คู่',
    sellingPrice: fromBaht(55),
    reorderPoint: 50,
  },
  {
    id: SEED_IDS.variants.hat,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.hat,
    sku: 'HAT-01',
    name: undefined,
    kind: 'simple',
    unit: 'ใบ',
    sellingPrice: fromBaht(120),
    reorderPoint: 25,
  },
  {
    id: SEED_IDS.variants.waterCan,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.waterCan,
    sku: 'WCN-10L',
    name: undefined,
    kind: 'simple',
    unit: 'ใบ',
    sellingPrice: fromBaht(145),
    reorderPoint: 12,
  },
  {
    id: SEED_IDS.variants.bundleWater,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.bundleWater,
    sku: 'BDL-WATER-01',
    name: undefined,
    kind: 'bundle',
    unit: 'ชุด',
    sellingPrice: fromBaht(690),
    reorderPoint: 0,
  },
  {
    id: SEED_IDS.variants.bundleMow,
    orgId: SEED_IDS.org,
    productId: SEED_IDS.products.bundleMow,
    sku: 'BDL-MOW-01',
    name: undefined,
    kind: 'bundle',
    unit: 'ชุด',
    sellingPrice: fromBaht(4790),
    reorderPoint: 0,
  },
];

/** Recipes. Selling 1 bundle must consume these components. */
export const SEED_BUNDLE_COMPONENTS: NewBundleComponent[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    orgId: SEED_IDS.org,
    bundleVariantId: SEED_IDS.variants.bundleWater,
    componentVariantId: SEED_IDS.variants.hose,
    qtyPerBundle: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    orgId: SEED_IDS.org,
    bundleVariantId: SEED_IDS.variants.bundleWater,
    componentVariantId: SEED_IDS.variants.nozzle,
    qtyPerBundle: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    orgId: SEED_IDS.org,
    bundleVariantId: SEED_IDS.variants.bundleWater,
    componentVariantId: SEED_IDS.variants.conn,
    qtyPerBundle: 2,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    orgId: SEED_IDS.org,
    bundleVariantId: SEED_IDS.variants.bundleMow,
    componentVariantId: SEED_IDS.variants.mower,
    qtyPerBundle: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    orgId: SEED_IDS.org,
    bundleVariantId: SEED_IDS.variants.bundleMow,
    componentVariantId: SEED_IDS.variants.blade,
    qtyPerBundle: 2,
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    orgId: SEED_IDS.org,
    bundleVariantId: SEED_IDS.variants.bundleMow,
    componentVariantId: SEED_IDS.variants.glove,
    qtyPerBundle: 1,
  },
];

/**
 * Opening stock. Each entry becomes TWO rows: a `purchase_in` movement (the
 * ledger event) and the `stock_lots` layer it opened (the FIFO cost layer).
 * The runner links them with `sourceMovementId`.
 *
 * Costs rise over time on purpose. Sell 70 hoes and the engine must take 60 at
 * 120.00 baht and 10 at 132.00 baht, and the movement detail screen must be
 * able to show exactly that split.
 */
export interface SeedOpeningStock {
  movementId: string;
  lotId: string;
  variantId: string;
  qty: number;
  /** Purchase cost of one unit, in satang. */
  unitCost: number;
  receivedAt: Date;
  reference: string;
}

export const SEED_OPENING_STOCK: SeedOpeningStock[] = [
  {
    movementId: '12000000-0000-4000-8000-000000000001',
    lotId: '11000000-0000-4000-8000-000000000001',
    variantId: SEED_IDS.variants.hoe,
    qty: 60,
    unitCost: fromBaht(120),
    receivedAt: bkk('2026-01-12T09:00:00'),
    reference: 'PO-2026-001',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000002',
    lotId: '11000000-0000-4000-8000-000000000002',
    variantId: SEED_IDS.variants.hoe,
    qty: 40,
    unitCost: fromBaht(132),
    receivedAt: bkk('2026-03-05T09:00:00'),
    reference: 'PO-2026-018',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000003',
    lotId: '11000000-0000-4000-8000-000000000003',
    variantId: SEED_IDS.variants.spade,
    qty: 50,
    unitCost: fromBaht(108),
    receivedAt: bkk('2026-01-12T09:00:00'),
    reference: 'PO-2026-001',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000004',
    lotId: '11000000-0000-4000-8000-000000000004',
    variantId: SEED_IDS.variants.spade,
    qty: 30,
    unitCost: fromBaht(115),
    receivedAt: bkk('2026-04-02T09:00:00'),
    reference: 'PO-2026-031',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000005',
    lotId: '11000000-0000-4000-8000-000000000005',
    variantId: SEED_IDS.variants.machete,
    qty: 40,
    unitCost: fromBaht(155),
    receivedAt: bkk('2026-02-08T09:00:00'),
    reference: 'PO-2026-009',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000006',
    lotId: '11000000-0000-4000-8000-000000000006',
    variantId: SEED_IDS.variants.pruner,
    qty: 25,
    unitCost: fromBaht(210),
    receivedAt: bkk('2026-02-08T09:00:00'),
    reference: 'PO-2026-009',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000007',
    lotId: '11000000-0000-4000-8000-000000000007',
    variantId: SEED_IDS.variants.pruner,
    qty: 15,
    unitCost: fromBaht(228),
    receivedAt: bkk('2026-05-14T09:00:00'),
    reference: 'PO-2026-044',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000008',
    lotId: '11000000-0000-4000-8000-000000000008',
    variantId: SEED_IDS.variants.mower,
    qty: 6,
    unitCost: fromBaht(3250),
    receivedAt: bkk('2026-01-20T09:00:00'),
    reference: 'PO-2026-004',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000009',
    lotId: '11000000-0000-4000-8000-000000000009',
    variantId: SEED_IDS.variants.mower,
    qty: 4,
    unitCost: fromBaht(3480),
    receivedAt: bkk('2026-04-18T09:00:00'),
    reference: 'PO-2026-036',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000010',
    lotId: '11000000-0000-4000-8000-000000000010',
    variantId: SEED_IDS.variants.blade,
    qty: 200,
    unitCost: fromBaht(42),
    receivedAt: bkk('2026-01-20T09:00:00'),
    reference: 'PO-2026-004',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000011',
    lotId: '11000000-0000-4000-8000-000000000011',
    variantId: SEED_IDS.variants.blade,
    qty: 150,
    unitCost: fromBaht(48),
    receivedAt: bkk('2026-03-22T09:00:00'),
    reference: 'PO-2026-025',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000012',
    lotId: '11000000-0000-4000-8000-000000000012',
    variantId: SEED_IDS.variants.blade,
    qty: 100,
    unitCost: fromBaht(53),
    receivedAt: bkk('2026-05-30T09:00:00'),
    reference: 'PO-2026-050',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000013',
    lotId: '11000000-0000-4000-8000-000000000013',
    variantId: SEED_IDS.variants.hose,
    qty: 35,
    unitCost: fromBaht(290),
    receivedAt: bkk('2026-02-15T09:00:00'),
    reference: 'PO-2026-012',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000014',
    lotId: '11000000-0000-4000-8000-000000000014',
    variantId: SEED_IDS.variants.hose,
    qty: 25,
    unitCost: fromBaht(315),
    receivedAt: bkk('2026-05-02T09:00:00'),
    reference: 'PO-2026-040',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000015',
    lotId: '11000000-0000-4000-8000-000000000015',
    variantId: SEED_IDS.variants.nozzle,
    qty: 80,
    unitCost: fromBaht(72),
    receivedAt: bkk('2026-02-15T09:00:00'),
    reference: 'PO-2026-012',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000016',
    lotId: '11000000-0000-4000-8000-000000000016',
    variantId: SEED_IDS.variants.nozzle,
    qty: 60,
    unitCost: fromBaht(80),
    receivedAt: bkk('2026-05-02T09:00:00'),
    reference: 'PO-2026-040',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000017',
    lotId: '11000000-0000-4000-8000-000000000017',
    variantId: SEED_IDS.variants.conn,
    qty: 300,
    unitCost: fromBaht(18),
    receivedAt: bkk('2026-02-15T09:00:00'),
    reference: 'PO-2026-012',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000018',
    lotId: '11000000-0000-4000-8000-000000000018',
    variantId: SEED_IDS.variants.conn,
    qty: 200,
    unitCost: fromBaht(22),
    receivedAt: bkk('2026-05-02T09:00:00'),
    reference: 'PO-2026-040',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000019',
    lotId: '11000000-0000-4000-8000-000000000019',
    variantId: SEED_IDS.variants.fert50,
    qty: 80,
    unitCost: fromBaht(760),
    receivedAt: bkk('2026-03-01T09:00:00'),
    reference: 'PO-2026-016',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000020',
    lotId: '11000000-0000-4000-8000-000000000020',
    variantId: SEED_IDS.variants.fert50,
    qty: 60,
    unitCost: fromBaht(825),
    receivedAt: bkk('2026-06-03T09:00:00'),
    reference: 'PO-2026-055',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000021',
    lotId: '11000000-0000-4000-8000-000000000021',
    variantId: SEED_IDS.variants.fert25,
    qty: 60,
    unitCost: fromBaht(400),
    receivedAt: bkk('2026-03-01T09:00:00'),
    reference: 'PO-2026-016',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000022',
    lotId: '11000000-0000-4000-8000-000000000022',
    variantId: SEED_IDS.variants.fertOrg,
    qty: 120,
    unitCost: fromBaht(255),
    receivedAt: bkk('2026-03-01T09:00:00'),
    reference: 'PO-2026-016',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000023',
    lotId: '11000000-0000-4000-8000-000000000023',
    variantId: SEED_IDS.variants.fertOrg,
    qty: 80,
    unitCost: fromBaht(268),
    receivedAt: bkk('2026-06-03T09:00:00'),
    reference: 'PO-2026-055',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000024',
    lotId: '11000000-0000-4000-8000-000000000024',
    variantId: SEED_IDS.variants.sprayer,
    qty: 20,
    unitCost: fromBaht(640),
    receivedAt: bkk('2026-01-25T09:00:00'),
    reference: 'PO-2026-006',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000025',
    lotId: '11000000-0000-4000-8000-000000000025',
    variantId: SEED_IDS.variants.sprayer,
    qty: 12,
    unitCost: fromBaht(695),
    receivedAt: bkk('2026-04-28T09:00:00'),
    reference: 'PO-2026-038',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000026',
    lotId: '11000000-0000-4000-8000-000000000026',
    variantId: SEED_IDS.variants.glove,
    qty: 400,
    unitCost: fromBaht(28),
    receivedAt: bkk('2026-01-10T09:00:00'),
    reference: 'PO-2026-002',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000027',
    lotId: '11000000-0000-4000-8000-000000000027',
    variantId: SEED_IDS.variants.glove,
    qty: 300,
    unitCost: fromBaht(33),
    receivedAt: bkk('2026-05-20T09:00:00'),
    reference: 'PO-2026-047',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000028',
    lotId: '11000000-0000-4000-8000-000000000028',
    variantId: SEED_IDS.variants.hat,
    qty: 150,
    unitCost: fromBaht(72),
    receivedAt: bkk('2026-01-10T09:00:00'),
    reference: 'PO-2026-002',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000029',
    lotId: '11000000-0000-4000-8000-000000000029',
    variantId: SEED_IDS.variants.waterCan,
    qty: 70,
    unitCost: fromBaht(88),
    receivedAt: bkk('2026-02-20T09:00:00'),
    reference: 'PO-2026-014',
  },
  {
    movementId: '12000000-0000-4000-8000-000000000030',
    lotId: '11000000-0000-4000-8000-000000000030',
    variantId: SEED_IDS.variants.waterCan,
    qty: 50,
    unitCost: fromBaht(96),
    receivedAt: bkk('2026-06-10T09:00:00'),
    reference: 'PO-2026-058',
  },
];

/**
 * Learned SKU mappings. These are the rows a human created on a previous import
 * preview, and they are why the next Shopee file matches without a click.
 * Notice the platform SKUs are messy on purpose - that is what real exports
 * look like.
 */
export const SEED_CHANNEL_LISTINGS: NewChannelListing[] = [
  {
    id: '15000000-0000-4000-8000-000000000001',
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.shopeeMain,
    platformSku: 'SHP-จอบ-001',
    platformProductName: 'จอบขุดดิน ด้ามไม้ยาว ทนทาน',
    variantId: SEED_IDS.variants.hoe,
    matchSource: 'manual',
  },
  {
    id: '15000000-0000-4000-8000-000000000002',
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.shopeeMain,
    platformSku: 'shp hos 20m',
    platformProductName: 'สายยางรดน้ำ 20 เมตร ส่งไว',
    variantId: SEED_IDS.variants.hose,
    matchSource: 'manual',
  },
  {
    id: '15000000-0000-4000-8000-000000000003',
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.shopeeBranch,
    platformSku: 'BLD_3T_255',
    platformProductName: 'ใบมีดตัดหญ้า 3 ฟัน 10 นิ้ว',
    variantId: SEED_IDS.variants.blade,
    matchSource: 'manual',
  },
  {
    id: '15000000-0000-4000-8000-000000000004',
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.lazadaMain,
    platformSku: 'LZD-FRT-16-50',
    platformProductName: 'ปุ๋ย 16-16-16 กระสอบ 50 กิโล',
    variantId: SEED_IDS.variants.fert50,
    matchSource: 'manual',
  },
  {
    id: '15000000-0000-4000-8000-000000000005',
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.lazadaMain,
    platformSku: 'LZD-SPR16',
    platformProductName: 'ถังพ่นยา 16 ลิตร สะพายหลัง',
    variantId: SEED_IDS.variants.sprayer,
    matchSource: 'manual',
  },
  {
    id: '15000000-0000-4000-8000-000000000006',
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.tiktokMain,
    platformSku: 'TT-GLV-01',
    platformProductName: 'ถุงมือทำสวน 1 คู่',
    variantId: SEED_IDS.variants.glove,
    matchSource: 'manual',
  },
  {
    id: '15000000-0000-4000-8000-000000000007',
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.tiktokLive,
    platformSku: 'TT-LIVE-SET-WATER',
    platformProductName: 'ชุดรดน้ำต้นไม้ ไลฟ์สด',
    variantId: SEED_IDS.variants.bundleWater,
    matchSource: 'manual',
  },
];

/**
 * One import batch parked at `preview_ready`.
 *
 * It is the demo of the import screen: 12 orders parsed, one line that the
 * matcher could not resolve, and the original file still sitting in R2 under
 * `r2ObjectKey`. Nothing here moved stock yet - that happens on Apply.
 */
export const SEED_IMPORT_BATCHES: NewImportBatch[] = [
  {
    id: SEED_IDS.importBatch,
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.lazadaMain,
    detectedKind: 'lazada',
    status: 'preview_ready',
    fileName: 'lazada-orders-2026-06.xlsx',
    r2ObjectKey: `imports/${SEED_IDS.org}/2026/06/${SEED_IDS.importBatch}/lazada-orders-2026-06.xlsx`,
    fileSize: 48213,
    // Placeholder digest. The real one is computed from the uploaded bytes.
    checksum: 'demo-checksum-not-a-real-digest',
    rowsRead: 42,
    ordersParsed: 12,
    issues: [
      {
        severity: 'warning',
        row: 27,
        column: 'Seller SKU',
        code: 'unmatched_sku',
        message: 'ไม่พบ SKU "LZD-NEW-HAT-XL" ในระบบ กรุณาจับคู่สินค้า',
      },
    ],
    uploadedBy: SEED_IDS.users.stock,
  },
];

/**
 * Demo orders.
 *
 * IMPORTANT: none of them has moved stock, and their statuses say so
 * (`pending`, `confirmed`, `cancelled`). Deducting stock needs the FIFO engine,
 * which is a deliberate template stub - see packages/core/src/services/costing.
 * Once `applyBatch` and `recordMovements` are implemented, flip one of these to
 * `shipped` and the ledger fills itself.
 */
export const SEED_ORDERS: NewOrder[] = [
  {
    id: SEED_IDS.orders.shopeeA,
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.shopeeMain,
    externalOrderId: 'SP2606150001',
    status: 'pending',
    orderedAt: bkk('2026-06-15T10:24:00'),
    buyerName: 'คุณสมศรี ใจดี',
    grandTotal: fromBaht(505),
    raw: { source: 'seed' },
  },
  {
    id: SEED_IDS.orders.lazadaB,
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.lazadaMain,
    externalOrderId: 'LZD-2606140087',
    status: 'pending',
    orderedAt: bkk('2026-06-14T19:02:00'),
    buyerName: 'คุณอนันต์ พูลสุข',
    grandTotal: fromBaht(1210),
    importBatchId: SEED_IDS.importBatch,
    raw: { source: 'seed' },
  },
  {
    id: SEED_IDS.orders.tiktokCancelled,
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.tiktokMain,
    externalOrderId: 'TT2606130455',
    status: 'cancelled',
    orderedAt: bkk('2026-06-13T21:47:00'),
    cancelledAt: bkk('2026-06-14T08:15:00'),
    buyerName: 'คุณวราภรณ์ ศรีทอง',
    grandTotal: fromBaht(200),
    raw: { source: 'seed' },
  },
  {
    id: SEED_IDS.orders.posWalkIn,
    orgId: SEED_IDS.org,
    channelId: SEED_IDS.channels.pos,
    externalOrderId: 'POS-2026-06-15-0007',
    status: 'confirmed',
    orderedAt: bkk('2026-06-15T14:05:00'),
    buyerName: 'ลูกค้าหน้าร้าน',
    grandTotal: fromBaht(4765),
    raw: { source: 'seed' },
  },
];

/**
 * Order lines. The Lazada order carries one `unmatched` line on purpose: that
 * null `variantId` is what the import preview screen asks the user to fix.
 */
export const SEED_ORDER_LINES: NewOrderLine[] = [
  {
    id: '14000000-0000-4000-8000-000000000001',
    orgId: SEED_IDS.org,
    orderId: SEED_IDS.orders.shopeeA,
    variantId: SEED_IDS.variants.hoe,
    platformSku: 'SHP-จอบ-001',
    platformProductName: 'จอบขุดดิน ด้ามไม้ยาว ทนทาน',
    qty: 2,
    unitPrice: fromBaht(185),
    discount: fromBaht(0),
    matchSource: 'listing_map',
  },
  {
    id: '14000000-0000-4000-8000-000000000002',
    orgId: SEED_IDS.org,
    orderId: SEED_IDS.orders.shopeeA,
    variantId: SEED_IDS.variants.conn,
    platformSku: 'CON-34',
    platformProductName: 'ข้อต่อสายยาง 3/4 นิ้ว',
    qty: 3,
    unitPrice: fromBaht(45),
    discount: fromBaht(0),
    matchSource: 'sku_exact',
  },
  {
    id: '14000000-0000-4000-8000-000000000003',
    orgId: SEED_IDS.org,
    orderId: SEED_IDS.orders.lazadaB,
    variantId: SEED_IDS.variants.fert50,
    platformSku: 'LZD-FRT-16-50',
    platformProductName: 'ปุ๋ย 16-16-16 กระสอบ 50 กิโล',
    qty: 1,
    unitPrice: fromBaht(980),
    discount: fromBaht(30),
    matchSource: 'listing_map',
  },
  {
    id: '14000000-0000-4000-8000-000000000004',
    orgId: SEED_IDS.org,
    orderId: SEED_IDS.orders.lazadaB,
    // Unmatched: no internal variant yet. This is the work queue item.
    variantId: undefined,
    platformSku: 'LZD-NEW-HAT-XL',
    platformProductName: 'หมวกชาวไร่ ปีกกว้าง ไซส์ XL',
    qty: 2,
    unitPrice: fromBaht(130),
    discount: fromBaht(0),
    matchSource: 'unmatched',
  },
  {
    id: '14000000-0000-4000-8000-000000000005',
    orgId: SEED_IDS.org,
    orderId: SEED_IDS.orders.tiktokCancelled,
    variantId: SEED_IDS.variants.glove,
    platformSku: 'TT-GLV-01',
    platformProductName: 'ถุงมือทำสวน 1 คู่',
    qty: 4,
    unitPrice: fromBaht(55),
    discount: fromBaht(20),
    matchSource: 'listing_map',
  },
  {
    id: '14000000-0000-4000-8000-000000000006',
    orgId: SEED_IDS.org,
    orderId: SEED_IDS.orders.posWalkIn,
    variantId: SEED_IDS.variants.mower,
    platformSku: 'MWR-2T-430',
    platformProductName: 'เครื่องตัดหญ้าสะพายบ่า 2 จังหวะ',
    qty: 1,
    unitPrice: fromBaht(4390),
    discount: fromBaht(100),
    matchSource: 'sku_exact',
  },
  {
    id: '14000000-0000-4000-8000-000000000007',
    orgId: SEED_IDS.org,
    orderId: SEED_IDS.orders.posWalkIn,
    variantId: SEED_IDS.variants.blade,
    platformSku: 'BLD-3T-255',
    platformProductName: 'ใบมีดตัดหญ้า 3 ฟัน ขนาด 10 นิ้ว',
    qty: 5,
    unitPrice: fromBaht(95),
    discount: fromBaht(0),
    matchSource: 'sku_exact',
  },
];

/**
 * Price tiers, tier prices and shop customers.
 *
 * Tier prices are DERIVED from the variant selling prices above, so a price
 * change in one place updates both lists consistently. The rounding is to a
 * whole baht because Thai shopkeepers do not quote satang on a wholesale sheet.
 *
 * The water can, gloves and hat deliberately have NO tier price: the demo bill
 * screen then shows a line falling back to the standard selling price, which is
 * the exact case resolvePrice() documents.
 */

/** Standard selling prices (baht) of the seeded simple variants, keyed by SEED_IDS.variants. */
const SEED_SELLING_BAHT: Record<keyof typeof SEED_IDS.variants, number> = {
  hoe: 185,
  spade: 165,
  machete: 240,
  pruner: 320,
  mower: 4390,
  blade: 95,
  hose: 450,
  nozzle: 135,
  conn: 45,
  fert50: 980,
  fert25: 520,
  fertOrg: 350,
  sprayer: 890,
  glove: 55,
  hat: 120,
  waterCan: 145,
  bundleWater: 690,
  bundleMow: 4790,
};

/** Wholesale = 10% off, dealer = 18% off, both rounded to a whole baht. */
const tierPriceRow = (
  variant: keyof typeof SEED_IDS.variants,
  tierId: string,
  factor: number,
): NewPriceTierPrice => ({
  orgId: SEED_IDS.org,
  priceTierId: tierId,
  variantId: SEED_IDS.variants[variant],
  price: fromBaht(Math.round(SEED_SELLING_BAHT[variant] * factor)),
});

export const SEED_PRICE_TIERS: NewPriceTier[] = [
  {
    id: SEED_IDS.priceTiers.retail,
    orgId: SEED_IDS.org,
    code: 'retail',
    name: 'ราคาปลีก',
    sortOrder: 1,
    isDefault: true,
  },
  {
    id: SEED_IDS.priceTiers.wholesale,
    orgId: SEED_IDS.org,
    code: 'wholesale',
    name: 'ราคาส่ง',
    sortOrder: 2,
    isDefault: false,
  },
  {
    id: SEED_IDS.priceTiers.dealer,
    orgId: SEED_IDS.org,
    code: 'dealer',
    name: 'ราคาตัวแทน',
    sortOrder: 3,
    isDefault: false,
  },
];

const WHOLESALE_VARIANTS = [
  'hoe',
  'spade',
  'machete',
  'pruner',
  'mower',
  'blade',
  'hose',
  'nozzle',
  'conn',
  'fert50',
  'fert25',
  'sprayer',
] as const;

const DEALER_VARIANTS = ['hoe', 'spade', 'machete', 'mower', 'fert50', 'sprayer'] as const;

export const SEED_PRICE_TIER_PRICES: NewPriceTierPrice[] = [
  ...WHOLESALE_VARIANTS.map((variant) =>
    tierPriceRow(variant, SEED_IDS.priceTiers.wholesale, 0.9),
  ),
  ...DEALER_VARIANTS.map((variant) => tierPriceRow(variant, SEED_IDS.priceTiers.dealer, 0.82)),
];

export const SEED_CUSTOMERS: NewCustomer[] = [
  {
    id: SEED_IDS.customers.walkIn,
    orgId: SEED_IDS.org,
    name: 'ลูกค้าหน้าร้าน',
    // No tier and no contact: the generic walk-in buyer at standard prices.
  },
  {
    id: SEED_IDS.customers.farmShopA,
    orgId: SEED_IDS.org,
    name: 'ร้านสวนเกษตรดี',
    phone: '0811111111',
    priceTierId: SEED_IDS.priceTiers.wholesale,
  },
  {
    id: SEED_IDS.customers.farmShopB,
    orgId: SEED_IDS.org,
    name: 'ร้านเกษตรภัณฑ์บ้านนา',
    phone: '0822222222',
    priceTierId: SEED_IDS.priceTiers.wholesale,
  },
  {
    id: SEED_IDS.customers.coop,
    orgId: SEED_IDS.org,
    name: 'สหกรณ์การเกษตรหนองบัว',
    phone: '0833333333',
    priceTierId: SEED_IDS.priceTiers.wholesale,
  },
  {
    id: SEED_IDS.customers.dealerNorth,
    orgId: SEED_IDS.org,
    name: 'ตัวแทนภาคเหนือ',
    phone: '0844444444',
    priceTierId: SEED_IDS.priceTiers.dealer,
  },
];
