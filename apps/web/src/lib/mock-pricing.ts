/**
 * Demo-mode mocks behind pricingApi / customersApi.
 *
 * Mirrors the seeded database: a default retail tier with no price rows, one
 * wholesale price per variant (the seed's 90% rule) and five customers whose
 * shapes match the customers screen. State is module-local so a demo PUT or
 * POST is visible to the next read, exactly like mock-data.ts does for orders.
 */

import type {
  CustomerInput,
  CustomerView,
  PriceMatrixRow,
  PriceResolutionView,
  PriceTierView,
  TierPriceCell,
} from './api-types-pricing';
import { MOCK_STOCK_ROWS } from './mock-data';

/** The wholesale discount the seeded tier prices follow. */
const WHOLESALE_FACTOR = 0.9;

export const MOCK_TIERS: PriceTierView[] = [
  { id: 'tier_retail', code: 'retail', name: 'ราคาปลีก', sortOrder: 1, isDefault: true },
  { id: 'tier_wholesale', code: 'wholesale', name: 'ราคาส่ง', sortOrder: 2, isDefault: false },
  { id: 'tier_dealer', code: 'dealer', name: 'ราคาตัวแทน', sortOrder: 3, isDefault: false },
];

const wholesalePrice = (sellingPrice: number): number =>
  Math.round(sellingPrice * WHOLESALE_FACTOR);

export const MOCK_MATRIX: PriceMatrixRow[] = MOCK_STOCK_ROWS.map((row) => ({
  variantId: row.variantId,
  sku: row.sku,
  name: row.name,
  sellingPrice: row.sellingPrice,
  tierPrices: { [MOCK_TIERS[1]?.id ?? 'tier_wholesale']: wholesalePrice(row.sellingPrice) },
}));

const withTier = (
  tierId: string,
): Pick<CustomerView, 'priceTierId' | 'priceTierCode' | 'priceTierName'> => {
  const tier = MOCK_TIERS.find((t) => t.id === tierId);
  return {
    priceTierId: tier?.id,
    priceTierCode: tier?.code,
    priceTierName: tier?.name,
  };
};

export const MOCK_CUSTOMERS: CustomerView[] = [
  { id: 'cus_walk_in', name: 'ลูกค้าหน้าร้าน', isActive: true, createdAt: '2026-01-02T03:00:00.000Z' },
  {
    id: 'cus_farm_shop_a',
    name: 'ร้านสวนเกษตรดี',
    phone: '053111001',
    isActive: true,
    createdAt: '2026-01-10T04:00:00.000Z',
    ...withTier('tier_wholesale'),
  },
  {
    id: 'cus_farm_shop_b',
    name: 'ร้านเกษตรภัณฑ์บ้านนา',
    phone: '053111002',
    isActive: true,
    createdAt: '2026-01-20T04:00:00.000Z',
    ...withTier('tier_wholesale'),
  },
  {
    id: 'cus_coop',
    name: 'สหกรณ์การเกษตรหนองบัว',
    phone: '053111003',
    isActive: true,
    createdAt: '2026-02-01T04:00:00.000Z',
    ...withTier('tier_wholesale'),
  },
  {
    id: 'cus_dealer_north',
    name: 'ตัวแทนภาคเหนือ',
    phone: '053111004',
    isActive: true,
    createdAt: '2026-02-11T04:00:00.000Z',
    ...withTier('tier_dealer'),
  },
];

/** Working copies, so the exported constants stay pristine between hot reloads. */
const matrix: PriceMatrixRow[] = MOCK_MATRIX.map((row) => ({
  ...row,
  tierPrices: { ...row.tierPrices },
}));
let customers: CustomerView[] = MOCK_CUSTOMERS.map((customer) => ({ ...customer }));

const notFound = (what: string): Error =>
  Object.assign(new Error(`ไม่พบ${what}ในเวอร์ชันสาธิต`), { code: 'not_found', status: 404 });

export interface ResolveOptions {
  customerId?: string;
  priceTierId?: string;
}

/** The view without any tier fields - the base for clearing a tier. */
const withoutTier = (customer: CustomerView): CustomerView => {
  const { priceTierId, priceTierCode, priceTierName, ...rest } = customer;
  return rest;
};

export const mockPricing = {
  listTiers: (): PriceTierView[] => MOCK_TIERS,

  matrix: (): PriceMatrixRow[] => matrix,

  putTierPrices: (
    tierId: string,
    cells: TierPriceCell[],
  ): { upserted: number; deleted: number } => {
    let upserted = 0;
    let deleted = 0;
    for (const cell of cells) {
      const row = matrix.find((candidate) => candidate.variantId === cell.variantId);
      if (!row) continue;
      if (cell.price === null) {
        if (row.tierPrices[tierId] !== undefined) {
          // Rebuild instead of delete: the lint rules (and V8) prefer it.
          const { [tierId]: removed, ...rest } = row.tierPrices;
          if (removed !== undefined) {
            row.tierPrices = rest;
            deleted += 1;
          }
        }
      } else {
        row.tierPrices[tierId] = cell.price;
        upserted += 1;
      }
    }
    return { upserted, deleted };
  },

  /** Same fallback rule as resolvePrice in @stockhub/core, on the mock data. */
  resolve: (variantIds: string[], options: ResolveOptions = {}): PriceResolutionView[] => {
    const customer = options.customerId
      ? customers.find((candidate) => candidate.id === options.customerId)
      : undefined;
    const tierId = options.priceTierId ?? customer?.priceTierId;
    const defaultTierId = MOCK_TIERS.find((tier) => tier.isDefault)?.id;
    return variantIds.map((variantId) => {
      const row = matrix.find((candidate) => candidate.variantId === variantId);
      if (!row) throw notFound('สินค้า');
      if (tierId !== undefined && row.tierPrices[tierId] !== undefined) {
        return {
          variantId,
          price: row.tierPrices[tierId] as number,
          priceSource: 'tier' as const,
          priceTierId: tierId,
        };
      }
      if (
        defaultTierId !== undefined &&
        defaultTierId !== tierId &&
        row.tierPrices[defaultTierId] !== undefined
      ) {
        return {
          variantId,
          price: row.tierPrices[defaultTierId] as number,
          priceSource: 'default_tier' as const,
          priceTierId: defaultTierId,
        };
      }
      return { variantId, price: row.sellingPrice, priceSource: 'selling_price' as const };
    });
  },

  listCustomers: (q?: string): CustomerView[] => {
    const needle = q?.trim().toLowerCase();
    const rows = needle
      ? customers.filter(
          (customer) =>
            customer.name.toLowerCase().includes(needle) ||
            customer.phone?.toLowerCase().includes(needle),
        )
      : customers;
    return rows.map((customer) => ({ ...customer }));
  },

  getCustomer: (id: string): CustomerView => {
    const customer = customers.find((candidate) => candidate.id === id);
    if (!customer) throw notFound('ลูกค้า');
    return { ...customer };
  },

  createCustomer: (input: CustomerInput): CustomerView => {
    const tierId = input.priceTierId ?? undefined;
    const customer: CustomerView = {
      id: `cus_${Date.now().toString(36)}`,
      name: input.name,
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.note !== undefined && { note: input.note }),
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
      ...(tierId !== undefined ? withTier(tierId) : {}),
    };
    customers = [customer, ...customers];
    return { ...customer };
  },

  updateCustomer: (id: string, input: CustomerInput): CustomerView => {
    const current = customers.find((candidate) => candidate.id === id);
    if (!current) throw notFound('ลูกค้า');
    const tierId = input.priceTierId;
    // null clears the tier, undefined leaves it, a value switches it.
    const updated: CustomerView =
      tierId === null
        ? { ...withoutTier(current), name: input.name ?? current.name }
        : {
            ...current,
            ...(input.name !== undefined && { name: input.name }),
            ...(input.phone !== undefined && { phone: input.phone }),
            ...(input.email !== undefined && { email: input.email }),
            ...(input.note !== undefined && { note: input.note }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
          };
    if (tierId !== null && tierId !== undefined) {
      Object.assign(updated, withTier(tierId));
    }
    customers = customers.map((customer) => (customer.id === id ? updated : customer));
    return { ...updated };
  },
};
