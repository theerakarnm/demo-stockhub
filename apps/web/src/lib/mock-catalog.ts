// MOCK: ---------------------------------------------------------------------
// MOCK: Demo fixtures for the catalog picker, imitating GET /catalog/search
// MOCK: and POST /listings faithfully on purpose. The SKUs, names, units,
// MOCK: prices and on-hand numbers mirror the seed in packages/db, so the demo
// MOCK: and a live database tell the same story.
// MOCK: ---------------------------------------------------------------------

import type { CatalogSearchRow, SaveListingInput, SaveListingResult } from './api-types-catalog';

export const MOCK_CATALOG: CatalogSearchRow[] = [
  {
    variantId: 'var_hoe',
    sku: 'HOE-001',
    name: 'จอบขุดดิน ด้ามไม้',
    kind: 'simple',
    unit: 'ด้าม',
    sellingPrice: 18500,
    onHand: 100,
  },
  {
    variantId: 'var_hose',
    sku: 'HOS-20M',
    name: 'สายยางรดน้ำ 5 หุน ยาว 20 เมตร',
    kind: 'simple',
    unit: 'ม้วน',
    sellingPrice: 45000,
    onHand: 60,
  },
  {
    variantId: 'var_sprayer',
    sku: 'SPR-16L',
    name: 'ถังพ่นยาสะพายหลัง 16 ลิตร',
    kind: 'simple',
    unit: 'ใบ',
    sellingPrice: 89000,
    onHand: 32,
  },
  {
    variantId: 'var_glove',
    sku: 'GLV-01',
    name: 'ถุงมือทำสวนเคลือบยาง',
    kind: 'simple',
    unit: 'คู่',
    sellingPrice: 5500,
    onHand: 700,
  },
  {
    variantId: 'var_fert50',
    sku: 'FRT-161616-50',
    name: 'ปุ๋ยเคมี สูตร 16-16-16 (ขนาด 50 กก.)',
    kind: 'simple',
    unit: 'กระสอบ',
    sellingPrice: 98000,
    onHand: 140,
  },
  {
    variantId: 'var_bundle_water',
    sku: 'BDL-WATER-01',
    name: 'ชุดรดน้ำต้นไม้ครบชุด (สินค้าชุด)',
    kind: 'bundle',
    unit: 'ชุด',
    sellingPrice: 69000,
    // A bundle owns no lots, so the real API reports 0 and the components
    // answer the availability question. The mock copies that behaviour.
    onHand: 0,
  },
];

const includesCaseInsensitive = (haystack: string, needle: string): boolean =>
  haystack.toLowerCase().includes(needle.toLowerCase());

export const mockCatalogApi = {
  /** Same shape as GET /catalog/search: substring match over sku and name. */
  search: (q: string, limit = 10): CatalogSearchRow[] => {
    const needle = q.trim();
    const rows =
      needle === ''
        ? MOCK_CATALOG
        : MOCK_CATALOG.filter(
            (row) =>
              includesCaseInsensitive(row.sku, needle) || includesCaseInsensitive(row.name, needle),
          );
    return rows.slice(0, limit);
  },

  /** The demo cannot touch the seed, so it always answers one line updated. */
  saveListing: (input: SaveListingInput): SaveListingResult => ({
    listingId: `lst_${Date.now()}`,
    channelId: input.channelId,
    platformSku: input.platformSku,
    variantId: input.variantId,
    linesUpdated: 1,
  }),
};

export type MockCatalogApi = typeof mockCatalogApi;
