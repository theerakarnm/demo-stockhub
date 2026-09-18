// MOCK: ---------------------------------------------------------------------
// MOCK: Demo fixtures for customers, price tiers and the price matrix.
// MOCK: Same contract as apps/api (D5-D6): wholesale cells sit at 90% of the
// MOCK: selling price, the retail default tier has no cells on purpose so the
// MOCK: fallback to the standard price stays visible in the demo.
// MOCK: ---------------------------------------------------------------------

import { can } from '@stockhub/core';
import { ApiError } from './api-error';
import type {
  CustomerInput,
  CustomerView,
  PriceMatrixRow,
  PriceResolutionView,
  PriceTierView,
  PutTierPricesResult,
  TierPriceCell,
} from './api-types-pricing';
import { getDemoIdentity } from './demo-identity';
import { MOCK_STOCK_ROWS } from './mock-data';

/** Same value the API uses to reject a caller without tier visibility. */
const notForbidden = (): ApiError => new ApiError('forbidden', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลระดับราคา', 403);

const requireTierRead = (): void => {
  if (!can(getDemoIdentity().role, 'price_tier:read')) throw notForbidden();
};

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

const RETAIL_TIER: PriceTierView = {
  id: 'tier_retail',
  code: 'retail',
  name: 'ราคาปลีก',
  sortOrder: 1,
  isDefault: true,
};

const WHOLESALE_TIER: PriceTierView = {
  id: 'tier_wholesale',
  code: 'wholesale',
  name: 'ราคาส่ง',
  sortOrder: 2,
  isDefault: false,
};

const DEALER_TIER: PriceTierView = {
  id: 'tier_dealer',
  code: 'dealer',
  name: 'ราคาตัวแทน',
  sortOrder: 3,
  isDefault: false,
};

export const MOCK_TIERS: PriceTierView[] = [RETAIL_TIER, WHOLESALE_TIER, DEALER_TIER];

// ---------------------------------------------------------------------------
// Matrix - one row per mock stock row, wholesale = 90% rounded to whole baht
// ---------------------------------------------------------------------------

const wholesaleCell = (sellingPrice: number): number =>
  Math.round((sellingPrice * 0.9) / 100) * 100;

export const MOCK_MATRIX: PriceMatrixRow[] = MOCK_STOCK_ROWS.map((row) => ({
  variantId: row.variantId,
  sku: row.sku,
  name: row.name,
  sellingPrice: row.sellingPrice,
  tierPrices: { [WHOLESALE_TIER.id]: wholesaleCell(row.sellingPrice) },
}));

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const MOCK_CUSTOMERS: CustomerView[] = [
  { id: 'cus_walk_in', name: 'ลูกค้าหน้าร้าน', isActive: true, createdAt: '2026-01-05T03:00:00.000Z' },
  {
    id: 'cus_farm_dee',
    name: 'ร้านสวนเกษตรดี',
    phone: '0811111111',
    isActive: true,
    priceTierId: 'tier_wholesale',
    priceTierCode: 'wholesale',
    priceTierName: 'ราคาส่ง',
    createdAt: '2026-02-11T04:30:00.000Z',
  },
  {
    id: 'cus_baan_na',
    name: 'ร้านเกษตรภัณฑ์บ้านนา',
    phone: '0822222222',
    isActive: true,
    priceTierId: 'tier_wholesale',
    priceTierCode: 'wholesale',
    priceTierName: 'ราคาส่ง',
    createdAt: '2026-03-02T07:15:00.000Z',
  },
  {
    id: 'cus_coop_nongbua',
    name: 'สหกรณ์การเกษตรหนองบัว',
    phone: '0833333333',
    isActive: true,
    priceTierId: 'tier_wholesale',
    priceTierCode: 'wholesale',
    priceTierName: 'ราคาส่ง',
    createdAt: '2026-04-20T09:45:00.000Z',
  },
  {
    id: 'cus_dealer_north',
    name: 'ตัวแทนภาคเหนือ',
    phone: '0844444444',
    isActive: true,
    priceTierId: 'tier_dealer',
    priceTierCode: 'dealer',
    priceTierName: 'ราคาตัวแทน',
    createdAt: '2026-05-18T02:20:00.000Z',
  },
];

/** Fill priceTierCode/Name from the tier table when only the id is known. */
const withTierNames = (customer: CustomerView): CustomerView => {
  if (!customer.priceTierId) return customer;
  const tier = MOCK_TIERS.find((candidate) => candidate.id === customer.priceTierId);
  if (!tier) return customer;
  return { ...customer, priceTierCode: tier.code, priceTierName: tier.name };
};

// ---------------------------------------------------------------------------
// The mock endpoints, shaped exactly like the real ones
// ---------------------------------------------------------------------------

export const mockPricing = {
  listTiers: (): PriceTierView[] => {
    requireTierRead();
    return MOCK_TIERS;
  },

  matrix: (): PriceMatrixRow[] => {
    requireTierRead();
    return MOCK_MATRIX;
  },

  /** Writes one tier row in place, so a reload of `matrix()` reflects it. */
  putTierPrices: (tierId: string, cells: TierPriceCell[]): PutTierPricesResult => {
    requireTierRead();
    if (!MOCK_TIERS.some((tier) => tier.id === tierId)) {
      throw new ApiError('not_found', 'ไม่พบระดับราคา', 404);
    }
    let upserted = 0;
    let deleted = 0;
    for (const cell of cells) {
      const row = MOCK_MATRIX.find((candidate) => candidate.variantId === cell.variantId);
      if (!row) continue;
      if (cell.price === null) {
        if (row.tierPrices[tierId] !== undefined) deleted += 1;
        delete row.tierPrices[tierId];
      } else {
        row.tierPrices[tierId] = cell.price;
        upserted += 1;
      }
    }
    return { upserted, deleted };
  },

  /**
   * Same fallback chain as the API, seen through the mock matrix: the
   * customer's tier cell wins, otherwise the standard selling price.
   */
  resolve: (
    variantIds: readonly string[],
    options: { customerId?: string; priceTierId?: string } = {},
  ): PriceResolutionView[] => {
    requireTierRead();
    const tierId =
      options.priceTierId ??
      MOCK_CUSTOMERS.find((customer) => customer.id === options.customerId)?.priceTierId;
    return variantIds.map((variantId) => {
      const row = MOCK_MATRIX.find((candidate) => candidate.variantId === variantId);
      if (!row) throw new ApiError('not_found', 'ไม่พบสินค้า', 404);
      const cell = tierId ? row.tierPrices[tierId] : undefined;
      if (cell !== undefined && tierId) {
        return { variantId, price: cell, priceSource: 'tier' as const, priceTierId: tierId };
      }
      return { variantId, price: row.sellingPrice, priceSource: 'selling_price' as const };
    });
  },

  listCustomers: (q?: string): CustomerView[] => {
    const needle = q?.trim().toLowerCase();
    const rows = needle
      ? MOCK_CUSTOMERS.filter(
          (customer) =>
            customer.name.toLowerCase().includes(needle) || (customer.phone ?? '').includes(needle),
        )
      : [...MOCK_CUSTOMERS];
    // Active first, then alphabetical, exactly like customerRepo.listCustomers.
    return rows.sort(
      (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'th'),
    );
  },

  getCustomer: (id: string): CustomerView => {
    const customer = MOCK_CUSTOMERS.find((candidate) => candidate.id === id);
    if (!customer) throw new ApiError('not_found', 'ไม่พบลูกค้า', 404);
    return customer;
  },

  createCustomer: (input: CustomerInput): CustomerView => {
    const customer: CustomerView = {
      id: `cus_demo_${Date.now()}`,
      name: input.name,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.note ? { note: input.note } : {}),
      isActive: input.isActive ?? true,
      ...(input.priceTierId ? { priceTierId: input.priceTierId } : {}),
      createdAt: new Date().toISOString(),
    };
    const saved = withTierNames(customer);
    MOCK_CUSTOMERS.push(saved);
    return saved;
  },

  /** PATCH semantics: an absent key keeps its value; `priceTierId: null` clears it. */
  updateCustomer: (id: string, input: CustomerInput): CustomerView => {
    const index = MOCK_CUSTOMERS.findIndex((candidate) => candidate.id === id);
    const current = MOCK_CUSTOMERS[index];
    if (!current) throw new ApiError('not_found', 'ไม่พบลูกค้า', 404);

    const next: CustomerView = { ...current };
    if (input.name !== undefined) next.name = input.name;
    if (input.phone !== undefined) next.phone = input.phone;
    if (input.email !== undefined) next.email = input.email;
    if (input.note !== undefined) next.note = input.note;
    if (input.isActive !== undefined) next.isActive = input.isActive;
    if (input.priceTierId !== undefined) {
      if (input.priceTierId === null) {
        // Rebuild without the tier keys instead of deleting, so the wire shape
        // matches the API (the fields are absent, not null).
        MOCK_CUSTOMERS[index] = {
          id: next.id,
          name: next.name,
          ...(next.phone ? { phone: next.phone } : {}),
          ...(next.email ? { email: next.email } : {}),
          ...(next.note ? { note: next.note } : {}),
          isActive: next.isActive,
          createdAt: next.createdAt,
        };
        return MOCK_CUSTOMERS[index];
      }
      next.priceTierId = input.priceTierId;
    }
    const saved = withTierNames(next);
    MOCK_CUSTOMERS[index] = saved;
    return saved;
  },
};
