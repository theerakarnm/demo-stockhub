/**
 * Demo fixtures for the catalog picker and the listing save.
 *
 * The rows imitate the seeded catalog (same SKUs and Thai product names), so
 * the demo picker behaves like the real backend. This is demo-only data: the
 * live path of api-catalog.ts never touches this file.
 */

import type { CatalogSearchRow, SaveListingInput, SaveListingResult } from './api-types-catalog';

export const MOCK_CATALOG: CatalogSearchRow[] = [
  {
    variantId: '0f000000-0000-4000-8000-000000000001',
    sku: 'HOE-001',
    name: 'จอบขุดดิน ด้ามไม้',
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: 18500,
    onHand: 100,
  },
  {
    variantId: '0f000000-0000-4000-8000-000000000002',
    sku: 'SPD-001',
    name: 'เสียมปลายแหลม',
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: 16500,
    onHand: 80,
  },
  {
    variantId: '0f000000-0000-4000-8000-000000000007',
    sku: 'HOS-20M',
    name: 'สายยางรดน้ำ 5 หุน ยาว 20 เมตร',
    kind: 'simple',
    unit: 'ม้วน',
    sellingPrice: 45000,
    onHand: 59,
  },
  {
    variantId: '0f000000-0000-4000-8000-000000000013',
    sku: 'SPR-16L',
    name: 'ถังพ่นยาสะพายหลัง 16 ลิตร',
    kind: 'simple',
    unit: 'ตัว',
    sellingPrice: 129000,
    onHand: 32,
  },
  {
    variantId: '0f000000-0000-4000-8000-000000000014',
    sku: 'GLV-01',
    name: 'ถุงมือทำสวนเคลือบยาง',
    kind: 'simple',
    unit: 'คู่',
    sellingPrice: 5500,
    onHand: 700,
  },
  {
    variantId: '0f000000-0000-4000-8000-000000000010',
    sku: 'FRT-161616-50',
    name: 'ปุ๋ยเคมี สูตร 16-16-16 (ขนาด 50 กก.)',
    kind: 'simple',
    unit: 'กระสอบ',
    sellingPrice: 98000,
    onHand: 140,
  },
];

export const mockCatalogApi = {
  /** Case-insensitive filter over SKU and product name, like the API's ilike. */
  search: (q: string, limit = 10): CatalogSearchRow[] => {
    const needle = q.trim().toLowerCase();
    if (needle === '') return [];
    return MOCK_CATALOG.filter(
      (row) => row.sku.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
    ).slice(0, limit);
  },

  /** Echoes the input - the demo never persists a learned mapping. */
  saveListing: (input: SaveListingInput): SaveListingResult => ({
    listingId: `lst_mock_${input.platformSku}`,
    channelId: input.channelId,
    platformSku: input.platformSku,
    variantId: input.variantId,
    linesUpdated: 1,
  }),
};
