/**
 * The 20 walkthrough steps. ALL Thai screen copy lives in this one file.
 *
 * Every value here is cross-checked against docs/demo-walkthrough.md section C;
 * the expected numbers are asserted by the walkthrough integration test
 * (apps/api/src/services/demo-walkthrough.test.ts), never hardcoded into UI.
 *
 * Seed ids are stable literals (packages/db/src/seed/data.ts), so the sample
 * specs can pin them directly - a re-seed rebuilds the same rows.
 */

/** Seeded ids the tour needs. Keep in sync with packages/db/src/seed/data.ts. */
export const TOUR_IDS = {
  ureaVariantId: '0f000000-0000-4000-8000-000000000019',
  shopeeMainChannelId: '0d000000-0000-4000-8000-000000000001',
  lazadaMainChannelId: '0d000000-0000-4000-8000-000000000003',
  tiktokLiveChannelId: '0d000000-0000-4000-8000-000000000006',
  coopCustomerId: '18000000-0000-4000-8000-000000000004',
} as const;

export interface TourAffected {
  label: string;
  href: string;
}

/** What one-click help the panel offers on this step. */
export type TourSample =
  | {
      kind: 'receive';
      sku: string;
      qty: number;
      unitCostBaht: number;
      receivedAt: string;
      reference: string;
    }
  | { kind: 'sample-file'; file: string; label: string; channelId: string }
  | { kind: 'wholesale-order'; customerId: string; sku: string; qty: number }
  | { kind: 'pos-order'; sku: string; qty: number };

export interface TourStep {
  /** 1..20, matches section C of docs/demo-walkthrough.md */
  step: number;
  title: string;
  /** Page the step happens on. */
  path: string;
  /** `data-tour-id` to spotlight; null = the panel is the whole instruction. */
  targetId: string | null;
  /** The action, one short line. */
  action: string;
  /** The plain-Thai why, at most two sentences. */
  narration: string;
  /** Data-flow card: what the action writes (or that it only reads). */
  writes: string;
  tables: string[];
  affected: TourAffected[];
  sample?: TourSample;
}

const inventoryHref = (variantId: string): string => `/inventory/${variantId}`;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    step: 1,
    title: 'เริ่มต้นวันทำงาน',
    path: '/',
    targetId: 'dashboard-lowstock-card',
    action: 'ดูกระดานสรุป แล้วกด "เริ่มทัวร์" ที่แผงด้านขวา',
    narration: 'หน้านี้คือกระดานสรุปของร้าน ตอนนี้ปุ๋ยยูเรียหมดสต็อก เราจะเริ่มจากรับของเข้าก่อน',
    writes: 'อ่านอย่างเดียว ไม่เขียนตารางใด',
    tables: [],
    affected: [{ label: 'สินค้าใกล้หมด', href: '/inventory?lowStock=true' }],
  },
  {
    step: 2,
    title: 'รับของเข้า ล็อตที่ 1',
    path: '/inventory/receive',
    targetId: 'receive-submit',
    action: 'กด "กรอกค่าตัวอย่าง" แล้วกด "บันทึกรับเข้า"',
    narration: 'รับของเข้า 1 รอบ ระบบจะจำไว้เป็น 1 ล็อต พร้อมราคาทุนของรอบนั้น',
    writes: 'ความเคลื่อนไหวสต็อก 1 รายการ + ล็อตต้นทุน 1 ล็อต',
    tables: ['stock_movements', 'stock_lots'],
    affected: [
      { label: 'ภาพรวม', href: '/' },
      { label: 'ตัวสินค้าเอง', href: inventoryHref(TOUR_IDS.ureaVariantId) },
    ],
    sample: {
      kind: 'receive',
      sku: 'FRT-UREA-50',
      qty: 60,
      unitCostBaht: 1000,
      receivedAt: '2026-09-17',
      reference: 'PO-2026-070',
    },
  },
  {
    step: 3,
    title: 'รับของเข้า ล็อตที่ 2 (คนละต้นทุน)',
    path: '/inventory/receive',
    targetId: 'receive-submit',
    action: 'กด "กรอกค่าตัวอย่าง" แล้วกด "บันทึกรับเข้า"',
    narration: 'ของล็อตใหม่แพงกว่าล็อตเก่า 85 บาท ระบบเก็บแยกกัน ไม่เฉลี่ยมั่ว เวลาขายจะตัดของเก่าก่อน',
    writes: 'ความเคลื่อนไหวสต็อก 1 รายการ + ล็อตต้นทุนอีก 1 ล็อต',
    tables: ['stock_movements', 'stock_lots'],
    affected: [{ label: 'ดูล็อตทั้ง 2', href: inventoryHref(TOUR_IDS.ureaVariantId) }],
    sample: {
      kind: 'receive',
      sku: 'FRT-UREA-50',
      qty: 50,
      unitCostBaht: 1085,
      receivedAt: '2026-09-18',
      reference: 'PO-2026-071',
    },
  },
  {
    step: 4,
    title: 'นำเข้าไฟล์ออเดอร์ Shopee',
    path: '/imports/new',
    targetId: 'sample-file-shopee-am',
    action: 'กด "ใช้ไฟล์ตัวอย่าง Shopee (เช้า)" (หรือลากไฟล์ของร้านคุณเองเข้ามาก็ได้)',
    narration: 'ลากไฟล์ที่โหลดจาก Shopee เข้ามาได้เลย ระบบอ่านหัวตารางเป็นและรู้ว่าแต่ละคอลัมน์คืออะไร',
    writes: 'ไฟล์ต้นฉบับขึ้นคลังพักไฟล์ + บันทึกการนำเข้า 1 แถว (ยังไม่แตะสต็อก)',
    tables: ['import_batches'],
    affected: [{ label: 'ประวัตินำเข้า', href: '/imports' }],
    sample: {
      kind: 'sample-file',
      file: 'shopee-demo-2026-09-19-am.csv',
      label: 'Shopee (เช้า)',
      channelId: TOUR_IDS.shopeeMainChannelId,
    },
  },
  {
    step: 5,
    title: 'จับคู่ SKU ที่ระบบยังไม่รู้จัก',
    path: '/imports/[id]',
    targetId: 'unmatched-panel',
    action: 'เลือก SHP-หมวก-XL แล้วจับคู่กับ "หมวกชาวไร่ปีกกว้าง"',
    narration: 'จับคู่ครั้งเดียว ครั้งหน้าไฟล์ที่มี SKU นี้ระบบจับคู่ให้เองอัตโนมัติ',
    writes: 'บันทึกการจับคู่ 1 รายการ (ยังไม่แตะสต็อก)',
    tables: ['channel_listings'],
    affected: [{ label: 'หมวกชาวไร่', href: '/inventory?lowStock=false' }],
  },
  {
    step: 6,
    title: 'ยืนยันตัดสต็อกจากไฟล์ Shopee',
    path: '/imports/[id]',
    targetId: 'apply-button',
    action: 'กด "ยืนยันตัดสต็อก"',
    narration: 'กดครั้งเดียว สต็อกทุกช่องทางลดพร้อมกัน ออเดอร์ที่ลูกค้ายกเลิกระบบข้ามให้เอง ไม่ตัดของ',
    writes: 'ออเดอร์ 4 ใบ + ความเคลื่อนไหวสต็อก 5 รายการ ในหนึ่งทรานแซกชัน',
    tables: ['orders', 'order_lines', 'stock_movements', 'movement_lot_consumptions', 'stock_lots'],
    affected: [{ label: 'ความเคลื่อนไหวสต็อก', href: '/movements' }],
  },
  {
    step: 7,
    title: 'ไฟล์ Lazada ที่มีแถวพิมพ์ผิด',
    path: '/imports/new',
    targetId: 'sample-file-lazada',
    action: 'กด "ใช้ไฟล์ตัวอย่าง Lazada" แล้วกด "ยืนยันตัดสต็อก"',
    narration: 'ไฟล์จริงมีแถวพิมพ์ผิดเสมอ ระบบข้ามเฉพาะแถวนั้นแล้วบอกว่าแถวไหนเสีย ที่เหลือเข้าปกติ',
    writes: 'ออเดอร์ 3 ใบ + ความเคลื่อนไหวสต็อก 3 รายการ / แถวเสียถูกจดไว้ ไม่ตัดสต็อก',
    tables: ['import_batches.issues', 'orders', 'stock_movements'],
    affected: [{ label: 'ส่วนแถวที่อ่านไม่ได้', href: '/imports' }],
    sample: {
      kind: 'sample-file',
      file: 'lazada-demo-2026-09-19.csv',
      label: 'Lazada',
      channelId: TOUR_IDS.lazadaMainChannelId,
    },
  },
  {
    step: 8,
    title: 'ไฟล์ TikTok ที่ขายเป็นสินค้าชุด',
    path: '/imports/new',
    targetId: 'sample-file-tiktok',
    action: 'กด "ใช้ไฟล์ตัวอย่าง TikTok Shop" แล้วกด "ยืนยันตัดสต็อก"',
    narration: 'ขายเป็นชุด แต่ของที่หายไปจากคลังคือชิ้นส่วนจริง ระบบแตกให้เองตามสูตร',
    writes: 'ออเดอร์ 2 ใบ บรรทัดออเดอร์เก็บรหัสชุด / ความเคลื่อนไหวออกที่ชิ้นส่วน',
    tables: ['order_lines', 'stock_movements'],
    affected: [{ label: 'สูตรสินค้าชุด', href: inventoryHref('0f000000-0000-4000-8000-000000000017') }],
    sample: {
      kind: 'sample-file',
      file: 'tiktok-demo-2026-09-19.csv',
      label: 'TikTok Shop',
      channelId: TOUR_IDS.tiktokLiveChannelId,
    },
  },
  {
    step: 9,
    title: 'เผลอ import ไฟล์เดิมซ้ำ',
    path: '/imports/new',
    targetId: 'sample-file-shopee-am',
    action: 'กด "ใช้ไฟล์ตัวอย่าง Shopee (เช้า)" ซ้ำ แล้วกด "ยืนยันตัดสต็อก"',
    narration: 'เผลอ import ไฟล์เดิมซ้ำกี่ครั้งก็ได้ ของจะไม่ถูกตัดซ้ำ',
    writes: 'ออเดอร์ถูกทับด้วยรหัสเดิม ไม่มีความเคลื่อนไหวสต็อกใหม่',
    tables: ['orders'],
    affected: [{ label: 'ยืนยันว่าไม่มีรายการใหม่', href: '/movements' }],
    sample: {
      kind: 'sample-file',
      file: 'shopee-demo-2026-09-19-am.csv',
      label: 'Shopee (เช้า)',
      channelId: TOUR_IDS.shopeeMainChannelId,
    },
  },
  {
    step: 10,
    title: 'ลูกค้ายกเลิกทีหลัง ของกลับเข้าคลัง',
    path: '/imports/new',
    targetId: 'sample-file-shopee-pm',
    action: 'กด "ใช้ไฟล์ตัวอย่าง Shopee (บ่าย)" แล้วกด "ยืนยันตัดสต็อก"',
    narration: 'ลูกค้ายกเลิกทีหลัง ของกลับเข้าคลังที่ราคาทุนเดิม ไม่ใช่ราคาทุนวันนี้',
    writes: 'ความเคลื่อนไหวคืนของ 2 รายการ คืนเข้าล็อตเดิมที่ต้นทุนเดิม',
    tables: ['stock_movements', 'stock_lots'],
    affected: [
      { label: 'ล็อตจอบกลับมาเท่าเดิม', href: inventoryHref('0f000000-0000-4000-8000-000000000001') },
    ],
    sample: {
      kind: 'sample-file',
      file: 'shopee-demo-2026-09-19-pm.csv',
      label: 'Shopee (บ่าย)',
      channelId: TOUR_IDS.shopeeMainChannelId,
    },
  },
  {
    step: 11,
    title: 'เปิดบิลขายส่ง',
    path: '/orders/new',
    targetId: 'order-customer-select',
    action: 'เลือกประเภท "ขายส่ง" แล้วเลือกลูกค้า "สหกรณ์การเกษตรหนองบัว" ใส่ปุ๋ยยูเรีย 100 กระสอบ',
    narration: 'เลือกลูกค้าแล้วราคาขึ้นตามระดับของเขาเอง พนักงานไม่ต้องจำว่าใครได้ราคาไหน',
    writes: 'ยังไม่เขียนอะไร เป็นการคำนวณราคาบนหน้าจอ',
    tables: [],
    affected: [{ label: 'ตารางราคาตามระดับ', href: '/settings/price-tiers' }],
    sample: {
      kind: 'wholesale-order',
      customerId: TOUR_IDS.coopCustomerId,
      sku: 'FRT-UREA-50',
      qty: 100,
    },
  },
  {
    step: 12,
    title: 'บันทึกบิลขายส่ง (ฉาก 103,400)',
    path: '/orders/new',
    targetId: 'order-submit',
    action: 'กด "บันทึกบิล"',
    narration: 'ขายหน้าร้านกับขายออนไลน์ตัดจากคลังกองเดียวกัน ไม่มีของสองชุด',
    writes: 'บิล + ความเคลื่อนไหวขายออก + การตัด 2 ล็อต ในหนึ่งทรานแซกชัน',
    tables: ['orders', 'order_lines', 'stock_movements', 'movement_lot_consumptions', 'stock_lots'],
    affected: [{ label: 'ล็อตยูเรียที่ถูกตัด', href: inventoryHref(TOUR_IDS.ureaVariantId) }],
    sample: {
      kind: 'wholesale-order',
      customerId: TOUR_IDS.coopCustomerId,
      sku: 'FRT-UREA-50',
      qty: 100,
    },
  },
  {
    step: 13,
    title: 'ทำไมทุนคือ 103,400 บาท',
    path: '/orders/[id]',
    targetId: 'lot-trace-card',
    action: 'กด "ดูการไล่ล็อต" แล้วดูการตัดทีละล็อต',
    narration:
      'ขาย 100 กระสอบ ระบบตัดของเก่าก่อนจนหมดแล้วค่อยตัดของใหม่ ทุนจริงคือ 103,400 บาท ไม่ใช่การเดาเฉลี่ย',
    writes: 'อ่านอย่างเดียว',
    tables: ['movement_lot_consumptions'],
    affected: [{ label: 'ดูรายการย้อนหลัง', href: '/movements' }],
  },
  {
    step: 14,
    title: 'พิมพ์ใบส่งของ',
    path: '/orders/[id]',
    targetId: 'print-button',
    action: 'กด "พิมพ์ใบส่งของ" แล้วกด "พิมพ์" ในหน้าตัวอย่าง',
    narration: 'ออกใบส่งของเป็น PDF ได้เลยจากเบราว์เซอร์ ไม่ต้องลงโปรแกรมเพิ่ม และไม่มีตัวเลขต้นทุนบนใบ',
    writes: 'ไม่เขียนอะไร',
    tables: [],
    affected: [{ label: 'กลับไปที่บิล', href: '/orders' }],
  },
  {
    step: 15,
    title: 'ขายหน้าร้านราคาปลีก',
    path: '/orders/new',
    targetId: 'order-submit',
    action: 'เลือกประเภท "หน้าร้าน" ใส่ปุ๋ยยูเรีย 2 กระสอบ แล้วกด "บันทึกบิล"',
    narration: 'สินค้าตัวเดียวกัน วันเดียวกัน ลูกค้าคนละแบบได้คนละราคา และทุนมาจากล็อตที่เหลือจริง',
    writes: 'บิล + ความเคลื่อนไหวขายออก + การตัด 1 ล็อต',
    tables: ['orders', 'order_lines', 'stock_movements', 'movement_lot_consumptions'],
    affected: [{ label: 'รายการบิล', href: '/orders' }],
    sample: { kind: 'pos-order', sku: 'FRT-UREA-50', qty: 2 },
  },
  {
    step: 16,
    title: 'ยกเลิกบิลหน้าร้าน',
    path: '/orders/[id]',
    targetId: 'cancel-order-button',
    action: 'กด "ยกเลิกบิล" ใส่เหตุผล แล้วยืนยัน',
    narration: 'ยกเลิกบิลแล้วของกลับเข้าคลังที่ต้นทุนเดิม ไม่ใช่ราคาทุนวันนี้',
    writes: 'ความเคลื่อนไหวคืนของ 1 รายการ คืนเข้าล็อตเดิม',
    tables: ['stock_movements', 'stock_lots'],
    affected: [{ label: 'ความเคลื่อนไหวสต็อก', href: '/movements' }],
  },
  {
    step: 17,
    title: 'ประวัติทุกการเคลื่อนไหว',
    path: '/movements',
    targetId: null,
    action: 'เปิดเมนู "ความเคลื่อนไหวสต็อก" ทางซ้าย',
    narration: 'ทุกการเคลื่อนไหวของของในคลังถูกบันทึกไว้หมด ย้อนดูได้ว่าของเข้าออกเมื่อไร ด้วยเหตุผลอะไร',
    writes: 'อ่านอย่างเดียว',
    tables: [],
    affected: [
      { label: 'ภาพรวม', href: '/' },
      { label: 'รายงานกำไร', href: '/reports/cogs' },
    ],
  },
  {
    step: 18,
    title: 'กำไรวันนี้ มาจากไหน',
    path: '/reports/cogs',
    targetId: null,
    action: 'เปิดเมนู "รายงานต้นทุน" ตั้งช่วงวันที่เป็นวันนี้',
    narration: 'กำไรคิดจากทุนจริงของล็อตที่ขายไป ไม่ใช่ทุนเฉลี่ยคร่าวๆ ตัวเลขนี้มาจากตารางเดียวกับที่ตัดสต็อก',
    writes: 'อ่านอย่างเดียว',
    tables: [],
    affected: [{ label: 'ความเคลื่อนไหวสต็อก', href: '/movements' }],
  },
  {
    step: 19,
    title: 'มุมมองพนักงานขาย',
    path: '/',
    targetId: 'role-switcher',
    action: 'กดปุ่มตำแหน่งงานบนแถบบน สลับเป็น "มาลี พนักงานขาย" แล้วดูหน้าเดิมทั้งหมด',
    narration: 'สลับเป็นพนักงานขาย ตัวเลขต้นทุนหายทั้งระบบ และหายตั้งแต่ฝั่งเซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนบนจอ',
    writes: 'ไม่เขียนอะไร ส่งหัวตำแหน่งงานไปให้ API กรองเอง',
    tables: [],
    affected: [{ label: 'ลองพิมพ์ URL รายงานตรงๆ', href: '/reports/cogs' }],
  },
  {
    step: 20,
    title: 'รีเซ็ตกลับจุดเริ่มต้น',
    path: '/',
    targetId: 'reset-demo-button',
    action: 'สลับกลับเป็น "สมชาย เจ้าของร้าน" แล้วกด "รีเซ็ต Demo" ที่แผงด้านขวา',
    narration: 'กดรีเซ็ตแล้วระบบกลับไปจุดเริ่มต้นเหมือนเดิมทุกตัวเลข สาธิตซ้ำได้ไม่จำกัด',
    writes: 'ล้างทุกตารางธุรกิจแล้วใส่ข้อมูลตั้งต้นกลับ ในหนึ่งทรานแซกชัน',
    tables: ['ทุกตาราง'],
    affected: [{ label: 'ภาพรวม', href: '/' }],
  },
] as const;

/** The step whose action lives on a page with a runtime [id] segment. */
export const stepPathFor = (
  step: TourStep,
  refs: { lastImportId?: string; wholesaleOrderId?: string; posOrderId?: string },
): string => {
  if (step.path !== '/imports/[id]' && step.path !== '/orders/[id]') return step.path;
  if (step.path === '/imports/[id]') return `/imports/${refs.lastImportId ?? ''}`;
  // Scene 13/14 are the wholesale bill, scene 16 is the storefront bill.
  return `/orders/${step.step === 16 ? (refs.posOrderId ?? '') : (refs.wholesaleOrderId ?? '')}`;
};
