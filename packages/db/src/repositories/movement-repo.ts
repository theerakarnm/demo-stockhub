/**
 * The stock ledger: write movements, read history.
 *
 * `stock_movements` is append only. Correcting a mistake means writing a new
 * movement with the opposite sign, never editing or deleting a row. That rule
 * is what lets the movement history screen double as an audit log.
 */

import {
  type LotConsumption,
  MOVEMENT_REASONS,
  type MovementReason,
  type OrgId,
  type PlannedMovement,
  type UserId,
  type VariantId,
  asStockLotId,
  asVariantId,
  satang,
} from '@stockhub/core';
import { and, asc, desc, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import {
  type channels,
  movementLotConsumptions,
  orders,
  products,
  stockLots,
  stockMovements,
  variants,
} from '../schema';
import { applyLotDeltas } from './inventory-repo';
import { NOT_A_SALE } from './order-repo';

export interface RecordMovementsInput {
  orgId: OrgId;
  planned: readonly PlannedMovement[];
  createdBy?: UserId;
  orderId?: string;
  channelId?: string;
  note?: string;
}

export interface RecordedMovement {
  movementId: string;
  variantId: VariantId;
  qtyDelta: number;
  costTotal: number;
}

/**
 * Persist what `planMovements` decided. MUST run inside a transaction.
 *
 * One planned movement becomes: the ledger row, plus its consumption rows and
 * lot deltas (outbound), the new FIFO layer it opens (inbound), or the
 * restored layers (return / cancel). Everything runs on the caller's `exec`,
 * so the whole write is one atomic unit under the lot locks taken in
 * getOpenLotsForUpdate().
 *
 * Planned rows with `qtyDelta === 0` (a full shortfall) are skipped: the
 * database rejects zero-qty movements, and nothing physically moved anyway -
 * the shortfall is reported by the planner, not written into the ledger.
 */
export const recordMovements = async (
  exec: DbExecutor,
  input: RecordMovementsInput & { reference?: string },
): Promise<RecordedMovement[]> => {
  const out: RecordedMovement[] = [];
  for (const plan of input.planned) {
    if (plan.qtyDelta === 0) continue; // full shortfall: nothing physically moved
    const [movement] = await exec
      .insert(stockMovements)
      .values({
        orgId: input.orgId,
        variantId: plan.variantId,
        warehouseId: plan.warehouseId,
        reason: plan.reason,
        qtyDelta: plan.qtyDelta,
        costTotal: plan.costTotal,
        channelId: input.channelId,
        orderId: input.orderId,
        occurredAt: plan.occurredAt,
        note: input.note,
        createdBy: input.createdBy,
      })
      .returning({ id: stockMovements.id });
    if (!movement) throw new Error('Insert into stock_movements returned no row');
    if (plan.qtyDelta < 0 && plan.consumption.length > 0) {
      await exec.insert(movementLotConsumptions).values(
        plan.consumption.map((slice) => ({
          orgId: input.orgId,
          movementId: movement.id,
          lotId: slice.lotId,
          qty: slice.qty,
          unitCost: slice.unitCost,
          lineCost: slice.lineCost,
        })),
      );
      await applyLotDeltas(
        exec,
        plan.consumption.map((slice) => ({ lotId: slice.lotId, qty: slice.qty })),
      );
    }
    if (plan.newLot) {
      await exec.insert(stockLots).values({
        orgId: input.orgId,
        variantId: plan.variantId,
        warehouseId: plan.warehouseId,
        qty: plan.newLot.qty,
        remainingQty: plan.newLot.qty,
        unitCost: plan.newLot.unitCost,
        receivedAt: plan.newLot.receivedAt,
        sourceMovementId: movement.id,
        reference: input.reference,
      });
    }
    if (plan.lotRestores) {
      await applyLotDeltas(
        exec,
        plan.lotRestores.map((restore) => ({ lotId: restore.lotId, qty: -restore.qty })),
      );
    }
    out.push({
      movementId: movement.id,
      variantId: plan.variantId,
      qtyDelta: plan.qtyDelta,
      costTotal: plan.costTotal,
    });
  }
  return out;
};

export interface HistoryQuery {
  orgId: OrgId;
  variantId?: VariantId;
  reason?: MovementReason;
  from?: Date;
  to?: Date;
  /** Keyset cursor: the last row the caller already served, so pages never
   *  repeat or skip a movement when two share an occurred_at. Replaces offset. */
  before?: { at: Date; id: string };
  limit?: number;
}

export interface HistoryRow {
  id: string;
  occurredAt: Date;
  reason: MovementReason;
  qtyDelta: number;
  /** Cost data. Strip it for roles without 'cost:read'. */
  costTotal: number;
  variantId: string;
  sku: string;
  productName: string;
  note: string | null;
  orderId: string | null;
  channelId: string | null;
  /** Running balance of the variant right after this movement, computed as
   *  sum(qty_delta) over the whole ledger of that variant. */
  qtyAfter: number;
  /** Where the stock physically moved. */
  warehouseId: string;
  /** Who recorded the row, when the actor is known. */
  createdBy: string | null;
}

/**
 * Movement history, newest first. Backed by the
 * stock_movements_variant_occurred_idx / _org_occurred_idx indexes.
 *
 * The running balance must be summed over EVERY movement of the variant, so
 * the inner select filters only by orgId (+ variantId) and the reason / date
 * / cursor filters run on the outer select, after the window function has
 * done its work. Filtering inside the window would silently restart the
 * balance at the first filtered page.
 *
 * Pages are keyset pages: `before` is the last row the caller already served,
 * compared as the (occurred_at, id) tuple, so a movement written between two
 * page requests can never shift rows across the border. `offset` would
 * re-read and re-skip rows on every such write, so it has no place in an
 * append-only ledger.
 *
 * Keep the page size bounded: this table grows forever.
 */
export const listHistory = async (exec: DbExecutor, query: HistoryQuery): Promise<HistoryRow[]> => {
  const balances = exec
    .select({
      id: stockMovements.id,
      variantId: stockMovements.variantId,
      warehouseId: stockMovements.warehouseId,
      reason: stockMovements.reason,
      qtyDelta: stockMovements.qtyDelta,
      costTotal: stockMovements.costTotal,
      channelId: stockMovements.channelId,
      orderId: stockMovements.orderId,
      occurredAt: stockMovements.occurredAt,
      note: stockMovements.note,
      createdBy: stockMovements.createdBy,
      qtyAfter:
        sql<number>`sum(${stockMovements.qtyDelta}) over (partition by ${stockMovements.variantId} order by ${stockMovements.occurredAt}, ${stockMovements.id})::int`.as(
          'qty_after',
        ),
    })
    .from(stockMovements)
    .where(
      query.variantId
        ? and(eq(stockMovements.orgId, query.orgId), eq(stockMovements.variantId, query.variantId))
        : eq(stockMovements.orgId, query.orgId),
    )
    .as('m');

  return exec
    .select({
      id: balances.id,
      occurredAt: balances.occurredAt,
      reason: balances.reason,
      qtyDelta: balances.qtyDelta,
      costTotal: balances.costTotal,
      variantId: balances.variantId,
      sku: variants.sku,
      productName: products.name,
      note: balances.note,
      orderId: balances.orderId,
      channelId: balances.channelId,
      qtyAfter: balances.qtyAfter,
      warehouseId: balances.warehouseId,
      createdBy: balances.createdBy,
    })
    .from(balances)
    .innerJoin(variants, eq(variants.id, balances.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(
      and(
        query.reason ? eq(balances.reason, query.reason) : undefined,
        query.from ? gte(balances.occurredAt, query.from) : undefined,
        query.to ? lte(balances.occurredAt, query.to) : undefined,
        query.before
          ? // The raw template cannot bind a JS Date (postgres.js rejects it in
            // a row-value comparison), so the cursor point crosses as an ISO
            // string, which Postgres infers as timestamptz here.
            sql`(${balances.occurredAt}, ${balances.id}) < (${query.before.at.toISOString()}, ${query.before.id})`
          : undefined,
      ),
    )
    .orderBy(desc(balances.occurredAt), desc(balances.id))
    .limit(query.limit ?? 50);
};

/**
 * Deliberately omits `qtyAfter`: the running balance is a property of the
 * whole variant ledger (see listHistory), while this read path narrows to one
 * order, where a window sum would only be a meaningless partial balance. The
 * reversal flow needs the lot slices, not the balance.
 */
export type OrderMovementRow = Omit<HistoryRow, 'qtyAfter'> & { consumptions: LotConsumption[] };

/**
 * Every movement caused by one order, oldest first. Used when a marketplace
 * flips an order to cancelled or returned and we must reverse exactly what it
 * did: each row carries the original lot slices, so the caller can feed them
 * into restoreFifo() instead of guessing today's cost.
 */
export const listMovementsForOrder = async (
  exec: DbExecutor,
  params: { orgId: OrgId; orderId: string },
): Promise<OrderMovementRow[]> => {
  const rows = await exec
    .select({
      id: stockMovements.id,
      occurredAt: stockMovements.occurredAt,
      reason: stockMovements.reason,
      qtyDelta: stockMovements.qtyDelta,
      costTotal: stockMovements.costTotal,
      variantId: stockMovements.variantId,
      sku: variants.sku,
      productName: products.name,
      note: stockMovements.note,
      orderId: stockMovements.orderId,
      channelId: stockMovements.channelId,
      warehouseId: stockMovements.warehouseId,
      createdBy: stockMovements.createdBy,
    })
    .from(stockMovements)
    .innerJoin(variants, eq(variants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(stockMovements.orgId, params.orgId), eq(stockMovements.orderId, params.orderId)))
    .orderBy(asc(stockMovements.occurredAt), asc(stockMovements.id));
  if (rows.length === 0) return [];

  // One query for every slice of the order instead of one query per movement.
  // inArray rejects an empty list, hence the early return above.
  const slices = await exec
    .select({
      movementId: movementLotConsumptions.movementId,
      lotId: movementLotConsumptions.lotId,
      qty: movementLotConsumptions.qty,
      unitCost: movementLotConsumptions.unitCost,
      lineCost: movementLotConsumptions.lineCost,
    })
    .from(movementLotConsumptions)
    .where(
      and(
        eq(movementLotConsumptions.orgId, params.orgId),
        inArray(
          movementLotConsumptions.movementId,
          rows.map((row) => row.id),
        ),
      ),
    );

  const byMovement = new Map<string, LotConsumption[]>();
  for (const slice of slices) {
    const list = byMovement.get(slice.movementId) ?? [];
    list.push({
      lotId: asStockLotId(slice.lotId),
      qty: slice.qty,
      unitCost: satang(slice.unitCost),
      lineCost: satang(slice.lineCost),
    });
    byMovement.set(slice.movementId, list);
  }

  return rows.map((row) => ({ ...row, consumptions: byMovement.get(row.id) ?? [] }));
};

// ---------------------------------------------------------------------------
// Report aggregates (read only).
//
// Every number a dashboard or report shows is computed HERE, from the same
// ledger rows the FIFO engine wrote. No screen may recompute stock numbers
// from another source - that is how the Excel drift started.
//
// `since`/`from`/`to` boundaries are UTC instants of Bangkok midnights, built
// by report-service so the SQL day buckets (to_char ... at time zone
// 'Asia/Bangkok') and the window edges can never disagree.
// ---------------------------------------------------------------------------

/**
 * Units sold (sale_out) since an instant, whole org. Signed positive.
 *
 * Orders whose status is NOT_A_SALE (cancelled / returned) are excluded, so a
 * cancelled bill stops counting as sold the moment it is cancelled - the same
 * rule sumChannelSales uses, which is what keeps the dashboard and the
 * reports telling one story.
 */
export const sumUnitsSoldSince = async (
  exec: DbExecutor,
  params: { orgId: OrgId; since: Date },
): Promise<number> => {
  const [row] = await exec
    .select({
      units: sql<number>`coalesce(sum(-${stockMovements.qtyDelta}), 0)::int`.as('units'),
    })
    .from(stockMovements)
    .innerJoin(orders, eq(orders.id, stockMovements.orderId))
    .where(
      and(
        eq(stockMovements.orgId, params.orgId),
        eq(stockMovements.reason, 'sale_out'),
        gte(stockMovements.occurredAt, params.since),
        notInArray(orders.status, [...NOT_A_SALE]),
      ),
    );
  return Number(row?.units ?? 0);
};

export interface ChannelSalesTodayRow {
  channelId: string;
  kind: (typeof channels.$inferSelect)['kind'];
  name: string;
  unitsSold: number;
  /** Seller revenue in satang, from the order lines the movement came from. */
  revenue: number;
}

/**
 * Today's sale_out per channel: units from the ledger, revenue from the order
 * lines behind each movement. The per-movement scalar subquery groups by
 * (order_id, variant_id), so two lines of one order sharing a variant cannot
 * double count, and it keeps the units/revenue join from fanning out.
 */
export const sumSalesByChannelSince = async (
  exec: DbExecutor,
  params: { orgId: OrgId; since: Date },
): Promise<ChannelSalesTodayRow[]> => {
  // Aggregate PER ORDER first. A bundle order writes one movement per
  // component while its single line carries the bundle's price, so a
  // movement-level revenue join either double counts or (matched on variant)
  // never fires at all. Per order: units from the movements, revenue from the
  // order's own lines, and NOT_A_SALE orders dropped wholesale.
  const rows = (await exec.execute(sql`
    with sale_order as (
      select m.channel_id,
             m.order_id,
             -sum(m.qty_delta) as units
      from stock_movements m
      join orders o on o.id = m.order_id
      where m.org_id = ${params.orgId}
        and m.reason = 'sale_out'
        and m.occurred_at >= ${params.since.toISOString()}
        and o.status not in ('cancelled', 'returned')
      group by m.channel_id, m.order_id
    )
    select so.channel_id,
           c.kind,
           c.name,
           sum(so.units)::int as units_sold,
           coalesce(sum((
             select coalesce(sum(ol.qty * ol.unit_price - ol.discount), 0)
             from order_lines ol
             where ol.order_id = so.order_id
           )), 0)::bigint as revenue
    from sale_order so
    join channels c on c.id = so.channel_id
    group by so.channel_id, c.kind, c.name
  `)) as unknown as Array<{
    channel_id: string;
    kind: ChannelSalesTodayRow['kind'];
    name: string;
    units_sold: number;
    revenue: string | number;
  }>;
  return rows.map((row) => ({
    channelId: row.channel_id,
    kind: row.kind,
    name: row.name,
    unitsSold: Number(row.units_sold),
    revenue: Number(row.revenue),
  }));
};

/**
 * Reasons that explain a balance change outside the normal buy/sell loop -
 * the variance definition of the wave 3 plan (decision D4): every movement
 * reason that is neither purchase_in nor sale_out.
 */
export const VARIANCE_REASONS: readonly MovementReason[] = MOVEMENT_REASONS.filter(
  (reason) => reason !== 'purchase_in' && reason !== 'sale_out',
);

export interface VarianceGroupRow {
  variantId: VariantId;
  sku: string;
  productName: string;
  variantName: string | null;
  /** Calendar day in Asia/Bangkok, 'YYYY-MM-DD'. */
  day: string;
  reason: MovementReason;
  /** Signed sum of the day's qty_delta for this variant + reason. */
  qtyDelta: number;
  movements: number;
}

/**
 * Variance groups (variant x day x reason), newest and biggest first.
 *
 * The caller merges the reason groups into one row per (variant, day) in
 * memory. The limit bounds the work for a busy ledger; 500 groups is far past
 * what a demo tenant produces in a year.
 */
export const listVarianceGroups = async (
  exec: DbExecutor,
  params: { orgId: OrgId; from: Date; limit?: number },
): Promise<VarianceGroupRow[]> => {
  const dayExpr = sql<string>`to_char(${stockMovements.occurredAt} at time zone 'Asia/Bangkok', 'YYYY-MM-DD')`;
  const day = dayExpr.as('day');
  const rows = await exec
    .select({
      variantId: stockMovements.variantId,
      sku: variants.sku,
      productName: products.name,
      variantName: variants.name,
      day,
      reason: stockMovements.reason,
      qtyDelta: sql<number>`sum(${stockMovements.qtyDelta})::int`.as('qty_delta'),
      movements: sql<number>`count(*)::int`.as('movements'),
    })
    .from(stockMovements)
    .innerJoin(variants, eq(variants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(
      and(
        eq(stockMovements.orgId, params.orgId),
        inArray(stockMovements.reason, [...VARIANCE_REASONS]),
        gte(stockMovements.occurredAt, params.from),
      ),
    )
    .groupBy(
      stockMovements.variantId,
      variants.sku,
      products.name,
      variants.name,
      dayExpr,
      stockMovements.reason,
    )
    .orderBy(desc(dayExpr), sql`abs(sum(${stockMovements.qtyDelta})) desc`)
    .limit(params.limit ?? 500);
  return rows.map((row) => ({
    ...row,
    variantId: asVariantId(row.variantId),
    qtyDelta: Number(row.qtyDelta),
    movements: Number(row.movements),
  }));
};

export interface CogsDayChannelRow {
  /** Calendar day in Asia/Bangkok, 'YYYY-MM-DD'. */
  day: string;
  channelId: string;
  unitsSold: number;
  revenue: number;
  /** Sum of the FIFO lot slices the sales consumed, in satang. */
  cogs: number;
}

/**
 * COGS per day and channel from movement_lot_consumptions.
 *
 * The consumption rows are the audit truth for what a sale cost; the movement
 * total is only their sum. Correlated scalar subqueries (one per movement,
 * summed per group) keep both the consumption join and the order-line revenue
 * join from fanning out the units.
 */
export const listCogsByDayChannel = async (
  exec: DbExecutor,
  params: { orgId: OrgId; from: Date; to: Date },
): Promise<CogsDayChannelRow[]> => {
  // Aggregate PER ORDER, then per day and channel. The old movement-level
  // version had two defects the guided demo would have shown a client:
  //   - revenue joined on variant_id, which never fires for a bundle order
  //     (the line holds the bundle id, the movements hold the components), and
  //   - a cancelled order's sale_out rows kept counting as sold.
  // Per order: revenue = the order's own lines, cogs = every lot slice its
  // sale movements consumed, and NOT_A_SALE orders are dropped entirely - the
  // same rule sumChannelSales applies, so the reports tell one story.
  const rows = (await exec.execute(sql`
    with sale_order as (
      select
        m.channel_id,
        to_char(min(m.occurred_at) at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as day,
        -sum(m.qty_delta) as units,
        (select coalesce(sum(ol.qty * ol.unit_price - ol.discount), 0)
           from order_lines ol
          where ol.order_id = m.order_id) as revenue,
        (select coalesce(sum(mlc.line_cost), 0)
           from movement_lot_consumptions mlc
          where mlc.movement_id in (
            select m2.id from stock_movements m2 where m2.order_id = m.order_id
          )) as cogs
      from stock_movements m
      join orders o on o.id = m.order_id
      where m.org_id = ${params.orgId}
        and m.reason = 'sale_out'
        and m.occurred_at >= ${params.from.toISOString()}
        and m.occurred_at <= ${params.to.toISOString()}
        and m.channel_id is not null
        and o.status not in ('cancelled', 'returned')
      group by m.order_id, m.channel_id
    )
    select day, channel_id, sum(units)::int as units_sold,
           sum(revenue)::bigint as revenue, sum(cogs)::bigint as cogs
    from sale_order
    group by day, channel_id
    order by day desc, channel_id
  `)) as unknown as Array<{
    day: string;
    channel_id: string;
    units_sold: number;
    revenue: string | number;
    cogs: string | number;
  }>;
  return rows.map((row) => ({
    day: row.day,
    channelId: row.channel_id,
    unitsSold: Number(row.units_sold),
    revenue: Number(row.revenue),
    cogs: Number(row.cogs),
  }));
};
