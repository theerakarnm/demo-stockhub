/**
 * The pricing + customers endpoint catalog: one function per API route,
 * mirroring apps/api D5-D6. Same split as api-client.ts - fetch, headers and
 * envelope handling live in api-core; this file only maps endpoint to request.
 *
 * In demo mode `demo()` routes every call to src/lib/mock-pricing.ts instead.
 */

import { demo, request, withQuery } from './api-core';
import type {
  CustomerInput,
  CustomerView,
  PriceMatrixRow,
  PriceResolutionView,
  PriceTierView,
  PutTierPricesResult,
  TierPriceCell,
} from './api-types-pricing';
import { mockPricing } from './mock-pricing';

export const pricingApi = {
  /** GET /api/v1/price-tiers */
  listTiers: (): Promise<PriceTierView[]> =>
    demo(
      () => mockPricing.listTiers(),
      () => request<PriceTierView[]>('/api/v1/price-tiers'),
    ),

  /** GET /api/v1/price-tiers/matrix */
  matrix: (): Promise<PriceMatrixRow[]> =>
    demo(
      () => mockPricing.matrix(),
      () => request<PriceMatrixRow[]>('/api/v1/price-tiers/matrix'),
    ),

  /** PUT /api/v1/price-tiers/:id/prices */
  putTierPrices: (tierId: string, cells: TierPriceCell[]): Promise<PutTierPricesResult> =>
    demo(
      () => mockPricing.putTierPrices(tierId, cells),
      () =>
        request<PutTierPricesResult>(`/api/v1/price-tiers/${encodeURIComponent(tierId)}/prices`, {
          method: 'PUT',
          body: { prices: cells },
        }),
    ),

  /** GET /api/v1/pricing/resolve?variantIds=a,b&customerId=... or &priceTierId=... */
  resolve: (
    variantIds: readonly string[],
    options: { customerId?: string; priceTierId?: string } = {},
  ): Promise<PriceResolutionView[]> =>
    demo(
      () => mockPricing.resolve(variantIds, options),
      () =>
        request<PriceResolutionView[]>(
          withQuery('/api/v1/pricing/resolve', {
            variantIds: variantIds.join(','),
            customerId: options.customerId,
            priceTierId: options.priceTierId,
          }),
        ),
    ),
};

export const customersApi = {
  /** GET /api/v1/customers?q=&limit= */
  list: (q?: string): Promise<CustomerView[]> =>
    demo(
      () => mockPricing.listCustomers(q),
      () => request<CustomerView[]>(withQuery('/api/v1/customers', { q })),
    ),

  /** GET /api/v1/customers/:id */
  get: (id: string): Promise<CustomerView> =>
    demo(
      () => mockPricing.getCustomer(id),
      () => request<CustomerView>(`/api/v1/customers/${encodeURIComponent(id)}`),
    ),

  /** POST /api/v1/customers */
  create: (input: CustomerInput): Promise<CustomerView> =>
    demo(
      () => mockPricing.createCustomer(input),
      () => request<CustomerView>('/api/v1/customers', { method: 'POST', body: input }),
    ),

  /** PATCH /api/v1/customers/:id */
  update: (id: string, input: CustomerInput): Promise<CustomerView> =>
    demo(
      () => mockPricing.updateCustomer(id, input),
      () =>
        request<CustomerView>(`/api/v1/customers/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: input,
        }),
    ),
};
