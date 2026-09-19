/**
 * The endpoint catalog of the web app: exactly one function per API route,
 * ordered like the HTTP contract. The fetch/envelope/header plumbing lives in
 * ./api-core so per-domain api-*.ts modules can reuse it; this file only maps
 * endpoint to request.
 *
 * In demo mode `demo()` routes every call to src/lib/mock-data.ts instead.
 */

import { demo, request, withQuery } from './api-core';
import type {
  ApplyImportResult,
  Channel,
  ChannelSalesQuery,
  ChannelSalesReport,
  CogsQuery,
  CogsReportResponse,
  CreateImportInput,
  CreateOrderInput,
  DashboardSummary,
  DemoResetResult,
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
  OrdersQuery,
  OrdersResponse,
  ReceiveStockInput,
  ReturnOrderLineInput,
  VarianceQuery,
  VarianceReport,
  VariantDetailResponse,
} from './api-types';
import { mockApi } from './mock-data';

export { ApiError, isApiError } from './api-error';

// ---------------------------------------------------------------------------
// One function per endpoint. Order matches the HTTP contract.
// ---------------------------------------------------------------------------

export const api = {
  /** GET /health */
  health: (): Promise<HealthResponse> =>
    demo(
      () => mockApi.health(),
      () => request<HealthResponse>('/health'),
    ),

  /** GET /api/v1/me */
  getMe: (): Promise<MeResponse> =>
    demo(
      () => mockApi.me(),
      () => request<MeResponse>('/api/v1/me'),
    ),

  /** GET /api/v1/channels */
  getChannels: (): Promise<Channel[]> =>
    demo(
      () => mockApi.channels(),
      () => request<Channel[]>('/api/v1/channels'),
    ),

  /** GET /api/v1/dashboard/summary */
  getDashboardSummary: (): Promise<DashboardSummary> =>
    demo(
      () => mockApi.dashboardSummary(),
      () => request<DashboardSummary>('/api/v1/dashboard/summary'),
    ),

  /** GET /api/v1/inventory */
  getInventory: (query: InventoryQuery = {}): Promise<InventoryResponse> =>
    demo(
      () => mockApi.inventory(query),
      () => request<InventoryResponse>(withQuery('/api/v1/inventory', { ...query })),
    ),

  /** GET /api/v1/inventory/:variantId */
  getVariant: (variantId: string): Promise<VariantDetailResponse> =>
    demo(
      () => mockApi.variant(variantId),
      () => request<VariantDetailResponse>(`/api/v1/inventory/${encodeURIComponent(variantId)}`),
    ),

  /** GET /api/v1/inventory/:variantId/movements */
  getVariantMovements: (
    variantId: string,
    query: Omit<MovementsQuery, 'variantId'> = {},
  ): Promise<MovementsResponse> =>
    demo(
      () => mockApi.movements({ ...query, variantId }),
      () =>
        request<MovementsResponse>(
          withQuery(`/api/v1/inventory/${encodeURIComponent(variantId)}/movements`, { ...query }),
        ),
    ),

  /** GET /api/v1/movements */
  getMovements: (query: MovementsQuery = {}): Promise<MovementsResponse> =>
    demo(
      () => mockApi.movements(query),
      () => request<MovementsResponse>(withQuery('/api/v1/movements', { ...query })),
    ),

  /** POST /api/v1/imports - multipart/form-data */
  createImport: ({ file, channelId }: CreateImportInput): Promise<ImportBatch> =>
    demo(
      () => mockApi.createImport(file.name, file.size, channelId),
      () => {
        const formData = new FormData();
        formData.append('file', file);
        if (channelId) formData.append('channelId', channelId);
        return request<ImportBatch>('/api/v1/imports', { method: 'POST', formData });
      },
    ),

  /** GET /api/v1/imports */
  getImports: (): Promise<ImportBatch[]> =>
    demo(
      () => mockApi.imports(),
      () => request<ImportBatch[]>('/api/v1/imports'),
    ),

  /** GET /api/v1/imports/:id */
  getImport: (id: string): Promise<ImportDetailResponse> =>
    demo(
      () => mockApi.importDetail(id),
      () => request<ImportDetailResponse>(`/api/v1/imports/${encodeURIComponent(id)}`),
    ),

  /** POST /api/v1/imports/:id/match - saves a channel_listing row server side. */
  matchImportSku: (id: string, input: MatchSkuInput): Promise<MatchSkuResult> =>
    demo(
      () => mockApi.matchImportSku(id, input),
      () =>
        request<MatchSkuResult>(`/api/v1/imports/${encodeURIComponent(id)}/match`, {
          method: 'POST',
          body: input,
        }),
    ),

  /** POST /api/v1/imports/:id/apply - commits the stock movements. */
  applyImport: (id: string): Promise<ApplyImportResult> =>
    demo(
      () => mockApi.applyImport(id),
      () =>
        request<ApplyImportResult>(`/api/v1/imports/${encodeURIComponent(id)}/apply`, {
          method: 'POST',
        }),
    ),

  /** GET /api/v1/orders */
  getOrders: (query: OrdersQuery = {}): Promise<OrdersResponse> =>
    demo(
      () => mockApi.orders(query),
      () => request<OrdersResponse>(withQuery('/api/v1/orders', { ...query })),
    ),

  /** GET /api/v1/orders/:id - one bill with its lines. */
  getOrder: (id: string): Promise<Order> =>
    demo(
      () => mockApi.getOrder(id),
      () => request<Order>(`/api/v1/orders/${encodeURIComponent(id)}`),
    ),

  /** POST /api/v1/orders - POS / wholesale bill. */
  createOrder: (input: CreateOrderInput): Promise<Order> =>
    demo(
      () => mockApi.createOrder(input),
      () => request<Order>('/api/v1/orders', { method: 'POST', body: input }),
    ),

  /** POST /api/v1/inventory/receive - goods receipt; also requires cost:write. */
  receiveStock: (input: ReceiveStockInput): Promise<Movement> =>
    demo(
      () => mockApi.receiveStock(input),
      () => request<Movement>('/api/v1/inventory/receive', { method: 'POST', body: input }),
    ),

  /** POST /api/v1/orders/:id/cancel - the exact FIFO slices of the sale go back. */
  cancelOrder: (id: string, reason: string): Promise<Movement[]> =>
    demo(
      () => mockApi.cancelOrder(id, reason),
      () =>
        request<Movement[]>(`/api/v1/orders/${encodeURIComponent(id)}/cancel`, {
          method: 'POST',
          body: { reason },
        }),
    ),

  /** POST /api/v1/orders/:id/return - full or partial customer return. */
  returnOrder: (id: string, lines: ReturnOrderLineInput[]): Promise<Movement[]> =>
    demo(
      () => mockApi.returnOrder(id, lines),
      () =>
        request<Movement[]>(`/api/v1/orders/${encodeURIComponent(id)}/return`, {
          method: 'POST',
          body: { lines },
        }),
    ),

  /** GET /api/v1/reports/channel-sales - net sales per channel from orders. */
  getChannelSalesReport: (query: ChannelSalesQuery = {}): Promise<ChannelSalesReport> =>
    demo(
      () => mockApi.channelSales(query),
      () => request<ChannelSalesReport>(withQuery('/api/v1/reports/channel-sales', { ...query })),
    ),

  /** GET /api/v1/reports/variance - non-trade balance changes per variant and day. */
  getVarianceReport: (query: VarianceQuery = {}): Promise<VarianceReport> =>
    demo(
      () => mockApi.variance(query),
      () => request<VarianceReport>(withQuery('/api/v1/reports/variance', { ...query })),
    ),

  /** POST /api/v1/demo/reset - guided walkthrough only, 404 outside development. */
  resetDemo: (): Promise<DemoResetResult> =>
    demo(
      () => Promise.resolve({ variantCount: 19, lotCount: 30, onHand: 2822, stockValue: 37924500 }),
      () =>
        request<DemoResetResult>('/api/v1/demo/reset', {
          method: 'POST',
          body: {},
        }),
    ),

  /** GET /api/v1/reports/cogs - 403 for roles without cost:read. */
  getCogsReport: (query: CogsQuery = {}): Promise<CogsReportResponse> =>
    demo(
      () => mockApi.cogsReport(query),
      () => request<CogsReportResponse>(withQuery('/api/v1/reports/cogs', { ...query })),
    ),
};

export type Api = typeof api;
