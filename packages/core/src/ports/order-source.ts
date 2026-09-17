/**
 * The most important seam in the codebase.
 *
 * Every marketplace is read through an OrderSourceAdapter. Today each adapter
 * parses a downloaded export file. Tomorrow a Shopee OpenAPI adapter can
 * implement the same interface and nothing outside packages/adapters changes.
 *
 * Rules for an adapter:
 *   1. It never touches the database, R2, or HTTP. Pure in -> out.
 *   2. It never decides stock. It only produces NormalizedOrder values.
 *   3. It never throws on a bad row. It reports the row in `issues` and carries on,
 *      so one broken line cannot kill a 2,000 line import.
 */

import type { ChannelKind, ImportableChannelKind, OrderStatus } from '../domain/enums';
import type { Satang } from '../domain/money';

/** A file as it arrives from the upload endpoint. */
export interface RawImportFile {
  fileName: string;
  /** MIME type as reported by the browser. Do not trust it - sniff the content. */
  contentType: string;
  bytes: Uint8Array;
}

export interface DetectionResult {
  kind: ImportableChannelKind;
  /** 0 = definitely not mine, 1 = certain. The registry picks the highest. */
  confidence: number;
  /** Short reason shown in the UI, e.g. 'found Shopee header "หมายเลขคำสั่งซื้อ"'. */
  reason: string;
}

export interface NormalizedOrderLine {
  /** Platform line id when the export has one, else undefined. */
  externalLineId?: string;
  /** SKU exactly as printed in the file. Matching happens later, not here. */
  platformSku: string;
  platformProductName: string;
  /** Shopee "ชื่อตัวเลือก" / Lazada variation, when present. */
  variationName?: string;
  quantity: number;
  unitPrice: Satang;
  /** Seller-funded discount for this line. Platform subsidy is not a cost. */
  discount: Satang;
}

export interface NormalizedOrder {
  /** Platform order number. Unique per channel - used for idempotent re-import. */
  externalOrderId: string;
  channelKind: ChannelKind;
  status: OrderStatus;
  orderedAt: Date;
  /** Present once the platform marks the parcel as handed over. */
  shippedAt?: Date;
  buyerName?: string;
  /** Sum of line totals after discount. Used to sanity-check the parse. */
  grandTotal: Satang;
  lines: NormalizedOrderLine[];
  /** Original row(s), kept verbatim so support can answer "why did it do that". */
  raw: Record<string, unknown>;
}

export type IssueSeverity = 'warning' | 'error';

export interface ParseIssue {
  severity: IssueSeverity;
  /** 1-based row number in the source file so the user can find it. */
  row?: number;
  column?: string;
  code: string;
  message: string;
}

export interface ParseResult {
  orders: NormalizedOrder[];
  issues: ParseIssue[];
  stats: {
    rowsRead: number;
    ordersParsed: number;
    linesParsed: number;
    rowsSkipped: number;
  };
}

export interface ParseContext {
  /** Timezone of the export file. Shopee/Lazada TH exports have no offset. */
  timeZone: string;
  /** Called on every N rows so the UI can show progress on large files. */
  onProgress?: (rowsRead: number) => void;
}

export interface OrderSourceAdapter {
  readonly kind: ImportableChannelKind;
  readonly displayName: string;
  /** Human note shown on the import screen, e.g. where to download the file. */
  readonly sourceHint: string;
  /** Cheap check on headers only. Must not parse the whole file. */
  detect(file: RawImportFile): Promise<DetectionResult>;
  parse(file: RawImportFile, ctx: ParseContext): Promise<ParseResult>;
}
