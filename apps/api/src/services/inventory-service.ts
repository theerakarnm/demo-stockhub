/**
 * Inventory read model + manual adjustments.
 *
 * THIS IS WHERE A DEVELOPER CONTINUES. Each function below documents the exact
 * query or domain call that replaces its NotImplementedError. Routes already
 * call these; while they throw, the routes fall back to MOCK data so the demo
 * keeps rendering (see routes/inventory.ts).
 */

import { NotImplementedError } from '@stockhub/core';
import type { MovementReason, VariantId } from '@stockhub/core';
import type { AdjustStockBody, ListInventoryQuery } from '../schemas/inventory';
import type { ListMovementsQuery } from '../schemas/movements';
import type { Movement, Page, StockRow, VariantDetail } from '../types/contract';
import type { ServiceContext } from './context';

/**
 * Page of stock rows for the inventory table.
 *
 * Query outline (packages/db should expose this as a repository function):
 *   SELECT v.id, v.sku, p.name, v.kind, v.unit, v.selling_price,
 *          v.low_stock_threshold,
 *          COALESCE(SUM(l.remaining_qty), 0)                    AS on_hand,
 *          COALESCE(SUM(l.remaining_qty * l.unit_cost), 0)      AS stock_value,
 *          r.reserved_qty
 *     FROM variants v
 *     JOIN products p ON p.id = v.product_id
 *     LEFT JOIN stock_lots l ON l.variant_id = v.id AND l.remaining_qty > 0
 *     LEFT JOIN (reserved per variant from confirmed-not-shipped orders) r ...
 *    WHERE v.org_id = $orgId
 *      AND ($q IS NULL OR v.sku ILIKE $q OR p.name ILIKE $q)
 *      AND ($channelId IS NULL OR EXISTS (channel_listings for that channel))
 *    GROUP BY ...
 *   HAVING (NOT $lowStock OR available <= v.low_stock_threshold)
 *    ORDER BY p.name ASC, v.id ASC
 *    LIMIT $limit + 1
 *
 * Two derived values are NOT SQL:
 *   - avgUnitCost = averageUnitCost(lots)      (core/services/costing/fifo)
 *   - a bundle row's `available` = bundleAvailability(components, onHandByVariant)
 *     because a bundle owns no lots of its own.
 *
 * Always return the cost fields. Hiding them is lib/response.ts's job.
 */
export const listInventory = async (
  _ctx: ServiceContext,
  _query: ListInventoryQuery,
): Promise<Page<StockRow>> => {
  throw new NotImplementedError('listInventory');
};

/**
 * One variant with its open FIFO lots, oldest first.
 *
 * Lots come back as the `lots` key, which stripCost() removes wholesale for a
 * role without `cost:read` - that is intentional, a lot list is cost data.
 */
export const getVariantDetail = async (
  _ctx: ServiceContext,
  _variantId: VariantId,
): Promise<VariantDetail> => {
  throw new NotImplementedError('getVariantDetail');
};

/**
 * Movement history, newest first, keyset paginated on (occurred_at, id).
 *
 * Used by both GET /movements and GET /inventory/:variantId/movements; the
 * second one just pins `variantId`.
 */
export const listMovements = async (
  _ctx: ServiceContext,
  _query: ListMovementsQuery,
): Promise<Page<Movement>> => {
  throw new NotImplementedError('listMovements');
};

/**
 * Manual stock correction (stock count, damage, loss).
 *
 * Transaction outline:
 *   1. lock the variant's open lots: SELECT ... FOR UPDATE
 *   2. positive delta -> planMovements({ reason: 'adjust_in' }) opens a new lot
 *      at the given unitCost (required; an inbound unit with no cost breaks FIFO)
 *   3. negative delta -> planMovements({ reason: 'adjust_out' }) consumes lots
 *      via consumeFifo(..., { onShortage: 'error' })
 *   4. insert the movement row + lot deltas, then commit
 */
export const adjustStock = async (
  _ctx: ServiceContext,
  _body: AdjustStockBody,
): Promise<Movement> => {
  throw new NotImplementedError('adjustStock');
};

/** Reason picker shared by the adjust path. Kept here so the rule is testable. */
export const adjustReason = (qtyDelta: number): MovementReason =>
  qtyDelta > 0 ? 'adjust_in' : 'adjust_out';
