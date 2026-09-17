/**
 * The ONLY place in the web app that talks to @stockhub/api.
 *
 * Responsibilities:
 *   1. prefix every path with NEXT_PUBLIC_API_URL
 *   2. attach the demo auth headers (x-demo-role / x-demo-org)
 *   3. unwrap the { error: { code, message, details } } envelope into ApiError
 *   4. expose exactly one function per endpoint in the HTTP contract
 *
 * In demo mode every call is answered by src/lib/mock-data.ts instead. Delete
 * that file and the `demo()` wrapper below to go live-only.
 */

import { ApiError } from './api-error';
import type {
  ApiErrorCode,
  ApiErrorEnvelope,
  ApplyImportResult,
  Channel,
  CogsQuery,
  CogsReportResponse,
  CreateImportInput,
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
  MovementsQuery,
  MovementsResponse,
  Order,
  OrdersQuery,
  OrdersResponse,
  VariantDetailResponse,
} from './api-types';
import { API_URL, DEMO_MODE, MOCK_LATENCY_MS } from './config';
import { getDemoIdentity } from './demo-identity';
import { mockApi } from './mock-data';

export { ApiError, isApiError } from './api-error';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Demo switch. `mock` runs when NEXT_PUBLIC_DEMO_MODE is not "false".
 * Keeping it in one helper means the live path below is already the real code.
 */
const demo = async <T>(mock: () => T | Promise<T>, live: () => Promise<T>): Promise<T> => {
  if (!DEMO_MODE) return live();
  await sleep(MOCK_LATENCY_MS);
  return mock();
};

const authHeaders = (): Record<string, string> => {
  const identity = getDemoIdentity();
  // DEMO AUTH ONLY. Real auth replaces these two headers with a bearer token;
  // no other line in this file changes.
  return {
    'x-demo-role': identity.role,
    'x-demo-org': identity.orgId,
  };
};

type QueryValue = string | number | boolean | undefined | null;

const withQuery = (path: string, query?: Record<string, QueryValue>): string => {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

const parseError = async (response: Response): Promise<ApiError> => {
  let code: ApiErrorCode = 'unknown';
  let message = `คำขอล้มเหลว (HTTP ${response.status})`;
  let details: Record<string, unknown> | undefined;

  try {
    const body = (await response.json()) as Partial<ApiErrorEnvelope>;
    if (body?.error) {
      code = body.error.code ?? 'unknown';
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    // Non-JSON body (proxy error page, gateway timeout). Keep the defaults.
  }

  return new ApiError(code, message, response.status, details);
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** JSON body. Mutually exclusive with `formData`. */
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, formData, signal } = options;

  const headers: Record<string, string> = { ...authHeaders() };
  // Do NOT set Content-Type for FormData - the browser adds the multipart boundary.
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal,
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ApiError('network_error', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่า API ทำงานอยู่', 0, {
      cause: String(cause),
    });
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

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

  /** POST /api/v1/orders - POS / wholesale bill. */
  createOrder: (input: CreateOrderInput): Promise<Order> =>
    demo(
      () => mockApi.createOrder(input),
      () => request<Order>('/api/v1/orders', { method: 'POST', body: input }),
    ),

  /** GET /api/v1/reports/cogs - 403 for roles without cost:read. */
  getCogsReport: (query: CogsQuery = {}): Promise<CogsReportResponse> =>
    demo(
      () => mockApi.cogsReport(query),
      () => request<CogsReportResponse>(withQuery('/api/v1/reports/cogs', { ...query })),
    ),
};

export type Api = typeof api;
