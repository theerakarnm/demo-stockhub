/**
 * Wire types for @stockhub/api, base path /api/v1.
 *
 * This file is the client half of the shared HTTP contract. It must match
 * apps/api exactly - if a field moves, change BOTH sides in the same commit.
 *
 * Money rule: every money field is an INTEGER number of satang (1 THB = 100
 * satang), exactly like `Satang` in @stockhub/core. JSON has no branded types,
 * so the fields are plain `number` here. Format them with the helpers in
 * src/lib/format.ts, never with toFixed().
 *
 * Fields marked `?` with a `cost-gated` comment are deleted by stripCost() on
 * the API when the caller role lacks the `cost:read` permission. The client
 * must therefore treat them as genuinely optional, not as "always there".
 */

import type {
  ChannelKind,
  ImportStatus,
  MatchSource,
  MovementReason,
  OrderStatus,
  ParseIssue,
  Permission,
  Role,
  VariantKind,
} from '@stockhub/core';

export type { ParseIssue };

/** Integer satang. Alias kept for readability at the call site. */
export type MoneyAmount = number;

/** ISO-8601 timestamp string as produced by the API (`new Date().toISOString()`). */
export type IsoDateTime = string;

/** Every list endpoint is keyed-set paginated, never offset paginated. */
export interface Paginated<T> {
  items: T[];
  /** Pass back as `cursor`. `null` means "no more rows". */
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Machine codes the API can return. Mapped to HTTP status on the server. */
export type ApiErrorCode =
  | 'not_implemented'
  | 'forbidden'
  | 'unmatched_sku'
  | 'insufficient_stock'
  | 'not_found'
  | 'validation_error'
  | 'network_error'
  | 'unknown';

/** Failure envelope. EVERY non-2xx response has this shape. */
export interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// GET /health, GET /api/v1/me
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  time: IsoDateTime;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
}

export interface MeResponse {
  user: ApiUser;
  role: Role;
  permissions: Permission[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/channels
// ---------------------------------------------------------------------------

export interface Channel {
  id: string;
  orgId: string;
  kind: ChannelKind;
  /** Shop name as the customer knows it, e.g. "ร้านเกษตรรุ่งเรือง (Shopee)". */
  name: string;
  isActive: boolean;
  /** Seller id on the marketplace, when the org filled it in. */
  externalShopId?: string;
  lastImportAt?: IsoDateTime;
}

// ---------------------------------------------------------------------------
// GET /api/v1/dashboard/summary
// ---------------------------------------------------------------------------

/**
 * Today's sales of one channel, straight from the movement ledger. Revenue is
 * selling money, not cost, so it is never stripped.
 */
export interface DashboardChannelStat {
  channelId: string;
  kind: ChannelKind;
  name: string;
  unitsSoldToday: number;
  revenueToday: MoneyAmount;
}

export interface DashboardSummary {
  totalSkus: number;
  totalOnHand: number;
  lowStockCount: number;
  /** cost-gated - the headline number of the role demo. */
  stockValue?: MoneyAmount;
  todaySold: number;
  pendingImports: number;
  unmatchedSkus: number;
  byChannel: DashboardChannelStat[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/inventory
// ---------------------------------------------------------------------------

export interface StockRow {
  variantId: string;
  sku: string;
  name: string;
  kind: VariantKind;
  /** Selling unit, e.g. "ชิ้น", "ชุด", "ลัง". */
  unit: string;
  onHand: number;
  reserved: number;
  available: number;
  sellingPrice: MoneyAmount;
  /** cost-gated */
  avgUnitCost?: MoneyAmount;
  /** cost-gated */
  stockValue?: MoneyAmount;
  lowStockThreshold: number;
}

export interface InventoryQuery {
  q?: string;
  channelId?: string;
  lowStock?: boolean;
  cursor?: string;
  limit?: number;
}

export type InventoryResponse = Paginated<StockRow>;

/** One component row of a bundle variant (สินค้าชุด). */
export interface BundleComponentRow {
  componentVariantId: string;
  sku: string;
  name: string;
  qtyPerBundle: number;
  /** On-hand of the component, used to compute how many bundles are sellable. */
  componentOnHand: number;
}

export interface VariantSummary {
  id: string;
  productId: string;
  sku: string;
  name: string;
  kind: VariantKind;
  unit: string;
  sellingPrice: MoneyAmount;
  lowStockThreshold: number;
  barcode?: string;
  /** Only present when kind === 'bundle'. */
  components?: BundleComponentRow[];
}

/** One open FIFO layer. The whole `lots` key is removed by stripCost(). */
export interface StockLotRow {
  id: string;
  variantId: string;
  remainingQty: number;
  receivedQty: number;
  unitCost: MoneyAmount;
  receivedAt: IsoDateTime;
  /** Purchase reference / supplier note, for the "why is my cost X" question. */
  reference?: string;
}

/** GET /api/v1/inventory/:variantId */
export interface VariantDetailResponse {
  variant: VariantSummary;
  onHand: number;
  reserved: number;
  available: number;
  /** cost-gated (the key itself is stripped, not just the values). */
  lots?: StockLotRow[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/movements, GET /api/v1/inventory/:variantId/movements
// ---------------------------------------------------------------------------

export interface Movement {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  reason: MovementReason;
  /** Positive = inbound, negative = outbound. Use isInbound() for colouring. */
  qtyDelta: number;
  /** Running balance right after this movement; computed server side. */
  qtyAfter?: number;
  occurredAt: IsoDateTime;
  warehouseId: string;
  channelId?: string;
  channelName?: string;
  orderId?: string;
  /** Human order reference, e.g. the Shopee order number. */
  orderRef?: string;
  note?: string;
  /** cost-gated */
  unitCost?: MoneyAmount;
  /** cost-gated - COGS for outbound, lot value for inbound. */
  totalCost?: MoneyAmount;
}

export interface MovementsQuery {
  variantId?: string;
  reason?: MovementReason;
  /** ISO date, inclusive. */
  from?: string;
  /** ISO date, inclusive. */
  to?: string;
  cursor?: string;
  limit?: number;
}

export type MovementsResponse = Paginated<Movement>;

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export interface ImportBatch {
  id: string;
  orgId: string;
  channelId?: string;
  channelKind?: ChannelKind;
  channelName?: string;
  fileName: string;
  /** Bytes, as uploaded. */
  fileSize: number;
  status: ImportStatus;
  /** Result of OrderSourceAdapter.detect() on the uploaded file. */
  detectedKind?: ChannelKind;
  detectionConfidence?: number;
  detectionReason?: string;
  uploadedAt: IsoDateTime;
  appliedAt?: IsoDateTime;
  rowsRead: number;
  ordersParsed: number;
  linesParsed: number;
  issueCount: number;
  unmatchedCount: number;
  uploadedByName?: string;
  /** Set when status === 'failed'. */
  errorMessage?: string;
}

export interface PreviewOrderLine {
  externalLineId?: string;
  platformSku: string;
  platformProductName: string;
  variationName?: string;
  quantity: number;
  unitPrice: MoneyAmount;
  discount: MoneyAmount;
  /** quantity * unitPrice - discount, computed by the API. */
  lineTotal: MoneyAmount;
  matchSource: MatchSource;
  /** Absent while matchSource === 'unmatched'. */
  variantId?: string;
  variantSku?: string;
  variantName?: string;
}

export interface PreviewOrder {
  externalOrderId: string;
  channelKind: ChannelKind;
  status: OrderStatus;
  orderedAt: IsoDateTime;
  shippedAt?: IsoDateTime;
  buyerName?: string;
  grandTotal: MoneyAmount;
  lines: PreviewOrderLine[];
}

/** One platform SKU the importer could not resolve, grouped across orders. */
export interface UnmatchedSku {
  platformSku: string;
  platformProductName: string;
  /** How many order lines reference it. */
  occurrences: number;
  /** Total units across those lines. */
  quantity: number;
  suggestions: Array<{ variantId: string; sku: string; name: string; score?: number }>;
}

/** GET /api/v1/imports/:id */
export interface ImportDetailResponse {
  batch: ImportBatch;
  orders: PreviewOrder[];
  issues: ParseIssue[];
  unmatched: UnmatchedSku[];
}

/** POST /api/v1/imports/:id/match */
export interface MatchSkuInput {
  platformSku: string;
  variantId: string;
}

export interface MatchSkuResult {
  platformSku: string;
  variantId: string;
  /** Lines in this batch that flipped from unmatched to matched. */
  linesUpdated: number;
}

/** POST /api/v1/imports/:id/apply */
export interface ApplyImportResult {
  movementsCreated: number;
  ordersApplied: number;
  /** cost-gated */
  cogs?: MoneyAmount;
}

export interface CreateImportInput {
  file: File;
  /** Omit to let the API auto-detect the marketplace from the file headers. */
  channelId?: string;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderLine {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: MoneyAmount;
  discount: MoneyAmount;
  lineTotal: MoneyAmount;
  /** cost-gated */
  unitCost?: MoneyAmount;
  /** cost-gated */
  totalCost?: MoneyAmount;
}

export interface Order {
  id: string;
  orgId: string;
  channelId: string;
  channelName: string;
  channelKind: ChannelKind;
  /** Bill number of record: a marketplace order number or a POS / wholesale bill number. */
  externalOrderId: string;
  status: OrderStatus;
  customerName?: string;
  orderedAt: IsoDateTime;
  grandTotal: MoneyAmount;
  /** cost-gated */
  cogs?: MoneyAmount;
  /** cost-gated - grandTotal minus cogs, as computed by the API. */
  margin?: MoneyAmount;
  lines: OrderLine[];
}

export interface OrdersQuery {
  channelId?: string;
  status?: OrderStatus;
  cursor?: string;
  limit?: number;
}

export type OrdersResponse = Paginated<Order>;

/** POST /api/v1/orders - manual bill, POS counter or wholesale. */
export interface CreateOrderInput {
  channelKind: 'pos' | 'wholesale';
  /** Links the bill to a wholesale customer; its tier prices unpriced lines. */
  customerId?: string;
  customerName?: string;
  note?: string;
  lines: Array<{
    variantId: string;
    quantity: number;
    /** Satang. Defaults to the variant selling price when omitted. */
    unitPrice?: MoneyAmount;
    discount?: MoneyAmount;
  }>;
}

/** POST /api/v1/inventory/receive - goods receipt; the server also requires cost:write. */
export interface ReceiveStockInput {
  variantId: string;
  qty: number;
  /** Satang. The received quantity opens a FIFO lot at this cost. */
  unitCost: MoneyAmount;
  /** Purchase reference, e.g. the PO number. */
  reference?: string;
  /** ISO datetime; omit to receive at "now". */
  receivedAt?: string;
  note?: string;
}

/** One line of POST /api/v1/orders/:id/return. */
export interface ReturnOrderLineInput {
  orderLineId: string;
  quantity: number;
  /** Damaged units restore their cost but never re-enter sellable stock. */
  restock?: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/v1/reports/channel-sales - net sales per channel from orders
// ---------------------------------------------------------------------------

/** One row of GET /reports/channel-sales. Revenue is selling money, never cost. */
export interface ChannelSalesRow {
  channelId: string;
  channelName: string;
  kind: ChannelKind;
  orders: number;
  unitsSold: number;
  revenue: MoneyAmount;
}

export interface ChannelSalesReport {
  days: number;
  /** Start of the window: Bangkok midnight, (days - 1) days before today. */
  from: IsoDateTime;
  to: IsoDateTime;
  rows: ChannelSalesRow[];
  totals: { orders: number; unitsSold: number; revenue: MoneyAmount };
}

export interface ChannelSalesQuery {
  /** Window in days, today included. */
  days?: number;
}

// ---------------------------------------------------------------------------
// GET /api/v1/reports/variance - non-trade balance changes per variant and day
// ---------------------------------------------------------------------------

/** One reason's share of a variant's variance on one day. */
export interface VarianceReasonTotal {
  reason: MovementReason;
  /** Signed: positive restored, negative lost. */
  qtyDelta: number;
  movements: number;
}

export interface VarianceRow {
  variantId: string;
  sku: string;
  name: string;
  /** Calendar day in Asia/Bangkok, 'YYYY-MM-DD'. */
  day: string;
  qtyDelta: number;
  movements: number;
  byReason: VarianceReasonTotal[];
}

export interface VarianceReport {
  days: number;
  from: IsoDateTime;
  to: IsoDateTime;
  rows: VarianceRow[];
}

export interface VarianceQuery {
  /** Window in days, today included. */
  days?: number;
}

// ---------------------------------------------------------------------------
// GET /api/v1/reports/cogs - requires the `cost:read` permission
// ---------------------------------------------------------------------------

/** One row of GET /reports/cogs: sales, FIFO cost and margin of one channel
 *  on one Bangkok day. The whole endpoint answers 403 without cost:read, so
 *  the optional cost fields here only document the wire shape. */
export interface CogsReportRow {
  /** Bangkok calendar day, 'YYYY-MM-DD'. */
  date: string;
  channelId: string;
  channelName: string;
  kind: ChannelKind;
  unitsSold: number;
  revenue: MoneyAmount;
  /** cost-gated */
  cogs?: MoneyAmount;
  /** cost-gated - revenue minus cogs, computed by the API. */
  margin?: MoneyAmount;
}

export interface CogsReportResponse {
  from: string;
  to: string;
  rows: CogsReportRow[];
  totals: {
    unitsSold: number;
    revenue: MoneyAmount;
    /** cost-gated */
    cogs?: MoneyAmount;
    /** cost-gated */
    margin?: MoneyAmount;
  };
}

export interface CogsQuery {
  /** Bangkok calendar date, 'YYYY-MM-DD'. Inclusive. */
  from?: string;
  /** Bangkok calendar date, 'YYYY-MM-DD'. Inclusive. */
  to?: string;
}
