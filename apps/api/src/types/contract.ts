/**
 * HTTP response types - the wire contract shared with apps/web.
 *
 * Keep this file free of Hono, Drizzle and R2 types: it describes JSON only.
 * If you change a shape here, change it in the web app's API client in the same
 * commit. Fields marked "cost field" are removed by stripCost() for roles
 * without the `cost:read` permission, which happens in lib/response.ts.
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

/**
 * A parse issue on the wire. Identical to the core port type - re-exported here
 * so apps/web imports its whole contract from one place and never has to depend
 * on the domain package.
 */
export type ParseIssueView = ParseIssue;

/** All money on the wire is an integer number of satang. Format in the UI. */
export type MoneyOnWire = number;

export interface HealthResponse {
  status: 'ok';
  version: string;
  time: string;
}

export interface MeResponse {
  user: { id: string; name: string; orgId: string };
  role: Role;
  permissions: Permission[];
}

export interface Channel {
  id: string;
  kind: ChannelKind;
  name: string;
  /** false when the channel is paused - imports are rejected for it. */
  isActive: boolean;
  /** null until the first successful import. ISO date. */
  lastImportedAt: string | null;
}

export interface DashboardChannelStat {
  channelId: string;
  kind: ChannelKind;
  name: string;
  unitsSoldToday: number;
  revenueToday: MoneyOnWire;
}

export interface DashboardSummary {
  totalSkus: number;
  totalOnHand: number;
  lowStockCount: number;
  /** cost field */
  stockValue?: MoneyOnWire;
  todaySold: number;
  pendingImports: number;
  unmatchedSkus: number;
  byChannel: DashboardChannelStat[];
}

export interface StockRow {
  variantId: string;
  sku: string;
  name: string;
  kind: VariantKind;
  /** Selling unit, e.g. 'ชิ้น', 'กล่อง'. */
  unit: string;
  onHand: number;
  /** Confirmed but not yet shipped. */
  reserved: number;
  /** onHand - reserved. For a bundle this is bundleAvailability(). */
  available: number;
  sellingPrice: MoneyOnWire;
  /** cost field */
  avgUnitCost?: MoneyOnWire;
  /** cost field */
  stockValue?: MoneyOnWire;
  lowStockThreshold: number;
}

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
  sellingPrice: MoneyOnWire;
  lowStockThreshold: number;
  barcode?: string;
  /** Only present when kind === 'bundle'. */
  components?: BundleComponentRow[];
}

/** One FIFO layer as returned to the UI. The whole `lots` key is a cost field. */
export interface StockLotView {
  id: string;
  variantId: string;
  remainingQty: number;
  /** What arrived; `remainingQty` never exceeds it. */
  receivedQty: number;
  /** cost field */
  unitCost: MoneyOnWire;
  receivedAt: string;
  reference?: string;
}

export interface VariantDetail {
  variant: VariantSummary;
  onHand: number;
  reserved: number;
  /** onHand - reserved; bundleAvailability() for a bundle. */
  available: number;
  /** cost field (the key itself is stripped) */
  lots?: StockLotView[];
}

/** One FIFO slice of an outbound movement, as recorded in movement_lot_consumptions. */
export interface MovementConsumption {
  lotId: string;
  qty: number;
  /** cost field */
  unitCost: MoneyOnWire;
  /** cost field */
  lineCost: MoneyOnWire;
}

export interface Movement {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  reason: MovementReason;
  /** Positive inbound, negative outbound. */
  qtyDelta: number;
  /** Running balance of the variant right after this movement. */
  qtyAfter: number;
  /** Where the stock physically moved. */
  warehouseId: string;
  channelId?: string;
  orderId?: string;
  note?: string;
  occurredAt: string;
  createdBy?: string;
  /** cost field */
  unitCost?: MoneyOnWire;
  /** cost field */
  totalCost?: MoneyOnWire;
  /** cost field */
  consumptions?: MovementConsumption[];
}

export interface OrderLine {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: MoneyOnWire;
  discount: MoneyOnWire;
  lineTotal: MoneyOnWire;
  /** cost field */
  totalCost?: MoneyOnWire;
}

export interface Order {
  id: string;
  externalOrderId: string;
  channelId: string;
  channelKind: ChannelKind;
  status: OrderStatus;
  /** Wholesale customer the bill was sold to, when it has one. */
  customerId?: string;
  customerName?: string;
  /** tier field */
  priceTierId?: string;
  grandTotal: MoneyOnWire;
  /** cost field */
  cogs?: MoneyOnWire;
  /** cost field */
  margin?: MoneyOnWire;
  orderedAt: string;
  lines: OrderLine[];
}

export interface ImportBatch {
  id: string;
  channelId: string | null;
  channelKind: ChannelKind | null;
  fileName: string;
  fileSize: number;
  /** R2 object key of the original upload. */
  objectKey: string;
  status: ImportStatus;
  /** Why the detector picked this adapter, shown on the preview screen. */
  detectionReason?: string;
  rowsRead: number;
  ordersParsed: number;
  unmatchedCount: number;
  issueCount: number;
  uploadedAt: string;
  appliedAt: string | null;
  uploadedBy: string;
}

export interface PreviewOrderLine {
  platformSku: string;
  platformProductName: string;
  quantity: number;
  unitPrice: MoneyOnWire;
  discount: MoneyOnWire;
  /** null when the line is still unmatched. */
  variantId: string | null;
  matchedSku: string | null;
  matchSource: MatchSource;
}

export interface PreviewOrder {
  externalOrderId: string;
  status: OrderStatus;
  orderedAt: string;
  buyerName?: string;
  grandTotal: MoneyOnWire;
  lines: PreviewOrderLine[];
}

export interface UnmatchedSku {
  platformSku: string;
  platformProductName: string;
  /** Total quantity across every line using this SKU - fix the big ones first. */
  quantity: number;
  occurrences: number;
  suggestions: { variantId: string; sku: string; name: string; score: number }[];
}

/** Body of GET /api/v1/imports/:id - everything the preview screen needs. */
export interface ImportPreviewResponse {
  batch: ImportBatch;
  orders: PreviewOrder[];
  issues: ParseIssueView[];
  unmatched: UnmatchedSku[];
}

export interface ApplyImportResult {
  movementsCreated: number;
  ordersApplied: number;
  /** cost field */
  cogs?: MoneyOnWire;
}

export interface CogsReportRow {
  date: string;
  channelId: string;
  channelName: string;
  kind: ChannelKind;
  unitsSold: number;
  revenue: MoneyOnWire;
  /** cost field */
  cogs?: MoneyOnWire;
  /** cost field */
  margin?: MoneyOnWire;
}

export interface CogsReport {
  from: string;
  to: string;
  rows: CogsReportRow[];
  totals: {
    unitsSold: number;
    revenue: MoneyOnWire;
    /** cost field */
    cogs?: MoneyOnWire;
    /** cost field */
    margin?: MoneyOnWire;
  };
}

/**
 * One row of GET /reports/channel-sales: net sales of one channel over the
 * window. Revenue is selling money, not cost, so no field here is cost-gated.
 */
export interface ChannelSalesRow {
  channelId: string;
  channelName: string;
  kind: ChannelKind;
  orders: number;
  unitsSold: number;
  revenue: MoneyOnWire;
}

export interface ChannelSalesReport {
  days: number;
  /** Start of the window: Bangkok midnight, (days - 1) days before today. */
  from: string;
  to: string;
  rows: ChannelSalesRow[];
  totals: { orders: number; unitsSold: number; revenue: MoneyOnWire };
}

/** One reason's share of a variant's variance on one day. */
export interface VarianceReasonTotal {
  reason: MovementReason;
  /** Signed: positive restored, negative lost. */
  qtyDelta: number;
  movements: number;
}

/**
 * One row of GET /reports/variance: why the balance of one variant moved on
 * one day for reasons other than buying in or selling out (decision D4 of the
 * wave 3 plan). Quantities only - stock staff can read every field.
 */
export interface VarianceRow {
  variantId: string;
  sku: string;
  name: string;
  /** Calendar day in Asia/Bangkok, 'YYYY-MM-DD'. */
  day: string;
  /** Signed sum over the day's variance movements. */
  qtyDelta: number;
  movements: number;
  byReason: VarianceReasonTotal[];
}

export interface VarianceReport {
  days: number;
  from: string;
  to: string;
  rows: VarianceRow[];
}

/** Envelope for every cursor paginated list endpoint. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Envelope for every failure. Built by middleware/error.ts. */
export interface ErrorResponse {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

// Domain barrels: Tasks 24, 31 and 32 own these files, so the contract is
// re-exported from here instead of merging every interface into this file.
export * from './contract-catalog';
export * from './contract-pricing';
