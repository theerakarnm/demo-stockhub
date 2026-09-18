/**
 * Inventory read model + manual adjustments.
 *
 * Reads are pure orchestration: SQL lives in @stockhub/db repositories, bundle
 * arithmetic in @stockhub/core, and cost hiding in lib/response.ts. Each
 * function below documents the exact repository calls it makes.
 */

import {
  NotImplementedError,
  StockHubError,
  asVariantId,
  bundleAvailability,
} from '@stockhub/core';
import type { MovementReason, VariantId } from '@stockhub/core';
import { catalogRepo, inventoryRepo, movementRepo } from '@stockhub/db';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { MAX_LIMIT } from '../schemas/common';
import type { AdjustStockBody, ListInventoryQuery } from '../schemas/inventory';
import type { ListMovementsQuery } from '../schemas/movements';
import type {
  BundleComponentRow,
  Movement,
  Page,
  StockLotView,
  StockRow,
  VariantDetail,
  VariantSummary,
} from '../types/contract';
import type { ServiceContext } from './context';

/** Shape of a variant id in Postgres, checked before it reaches the cast. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Display name shared by the list and the detail screen. */
const displayName = (productName: string, variantName: string | null): string =>
  variantName ? `${productName} (${variantName})` : productName;

/**
 * Page of stock rows for the inventory table.
 *
 * The page is a keyset page: the cursor carries the (product name, variant id)
 * sort key of the last SERVED row, and getStockOverview fetches `limit + 1` rows
 * so the extra row only tells whether a cursor follows.
 *
 * Two derived values are not SQL:
 *   - a bundle row's `onHand`/`available` = bundleAvailability(components,
 *     onHandByVariant), because a bundle owns no lots of its own;
 *   - the lowStock filter, which needs that overlaid availability and is
 *     therefore applied in memory after the fetch.
 *
 * Cost fields are always returned. Hiding them is lib/response.ts's job.
 */
export const listInventory = async (
  ctx: ServiceContext,
  query: ListInventoryQuery,
): Promise<Page<StockRow>> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

  const [overview, onHandByVariant, componentsByBundle] = await Promise.all([
    inventoryRepo.getStockOverview(exec, {
      orgId,
      search: query.q,
      after: cursor ? { name: cursor.at, id: cursor.id } : undefined,
      limit: query.limit,
    }),
    inventoryRepo.getOnHandByVariant(exec, { orgId }),
    catalogRepo.getBundleComponentMap(exec, { orgId }),
  ]);

  // A bundle's availability borrows its components' lots, so the overlay
  // replaces onHand with the same number the UI must show.
  const withAvailability = overview.map((row) => {
    const recipe = row.kind === 'bundle' ? (componentsByBundle.get(row.variantId) ?? []) : null;
    const available = recipe
      ? bundleAvailability(recipe, onHandByVariant)
      : row.onHand - row.reserved;
    return { row, onHand: recipe ? available : row.onHand, available };
  });

  const visible =
    query.lowStock === true
      ? withAvailability.filter(({ row, available }) => available <= row.reorderPoint)
      : withAvailability;

  const items = visible.slice(0, query.limit).map(
    ({ row, onHand, available }): StockRow => ({
      variantId: row.variantId,
      sku: row.sku,
      name: displayName(row.productName, row.variantName),
      kind: row.kind,
      unit: row.unit,
      onHand,
      reserved: row.reserved,
      available,
      sellingPrice: row.sellingPrice,
      avgUnitCost: row.avgUnitCost,
      stockValue: row.stockValue,
      lowStockThreshold: row.reorderPoint,
    }),
  );

  // The cursor comes from the last row actually served, never from the peek row.
  const lastRow = visible.at(query.limit - 1);
  const nextCursor =
    visible.length > query.limit && lastRow
      ? encodeCursor({ at: lastRow.row.productName, id: lastRow.row.variantId })
      : null;
  return { items, nextCursor };
};

/** StockRow carries no recipe, so the summary only attaches it for bundles. */
const toVariantSummary = (
  variant: catalogRepo.VariantWithProduct,
  components?: BundleComponentRow[],
): VariantSummary => ({
  id: variant.id,
  productId: variant.productId,
  sku: variant.sku,
  name: displayName(variant.productName, variant.name),
  kind: variant.kind,
  unit: variant.unit,
  sellingPrice: variant.sellingPrice,
  lowStockThreshold: variant.reorderPoint,
  barcode: variant.barcode ?? undefined,
  ...(components ? { components } : {}),
});

/**
 * One variant with its open FIFO lots, oldest first.
 *
 * Lots come back as the `lots` key, which stripCost() removes wholesale for a
 * role without `cost:read` - that is intentional, a lot list is cost data.
 *
 * onHand/reserved come from the same overview query the list screen uses, so
 * both screens can never disagree. A bundle gets `lots: []` and borrows its
 * components' availability, exactly like the list path.
 */
export const getVariantDetail = async (
  ctx: ServiceContext,
  variantId: VariantId,
): Promise<VariantDetail> => {
  const exec = ctx.db();
  const orgId = ctx.auth.orgId;

  // A variant id is a uuid column: a non-uuid string can never exist, and
  // letting Postgres cast it would end as a 500 instead of a 404.
  if (!UUID_PATTERN.test(variantId)) {
    throw new StockHubError('not_found', `Variant ${variantId} not found`, { variantId });
  }

  const variant = await catalogRepo.getVariantById(exec, { orgId, variantId });
  if (!variant) {
    throw new StockHubError('not_found', `Variant ${variantId} not found`, { variantId });
  }

  const [overview, onHandByVariant] = await Promise.all([
    inventoryRepo.getStockOverview(exec, { orgId, limit: MAX_LIMIT }),
    inventoryRepo.getOnHandByVariant(exec, { orgId }),
  ]);
  const overviewRow = overview.find((row) => row.variantId === variantId);
  const reserved = overviewRow?.reserved ?? 0;

  if (variant.kind === 'bundle') {
    const componentsByBundle = await catalogRepo.getBundleComponentMap(exec, { orgId });
    const recipe = componentsByBundle.get(variantId) ?? [];
    // The picker on the bundle detail screen shows component names and stock,
    // so the recipe is enriched with the component rows it points at.
    const componentVariants = await catalogRepo.getVariantsByIds(exec, {
      orgId,
      variantIds: recipe.map((component) => component.componentVariantId),
    });
    const components: BundleComponentRow[] = recipe.map((component) => {
      const row = componentVariants.get(component.componentVariantId);
      return {
        componentVariantId: component.componentVariantId,
        sku: row?.sku ?? '',
        name: row ? displayName(row.productName, row.name) : '',
        qtyPerBundle: component.qtyPerBundle,
        componentOnHand: onHandByVariant.get(component.componentVariantId) ?? 0,
      };
    });
    const available = bundleAvailability(recipe, onHandByVariant);
    return {
      variant: toVariantSummary(variant, components),
      onHand: available,
      reserved,
      available,
      lots: [],
    };
  }

  const lots: StockLotView[] = (await inventoryRepo.listOpenLots(exec, { orgId, variantId })).map(
    (lot) => ({
      id: lot.id,
      variantId: lot.variantId,
      remainingQty: lot.remainingQty,
      receivedQty: lot.receivedQty,
      unitCost: lot.unitCost,
      receivedAt: lot.receivedAt.toISOString(),
      reference: lot.reference ?? undefined,
    }),
  );
  // A variant missing from the overview page (past MAX_LIMIT rows) still has a
  // truthful onHand: the open lots are the same source the overview sums.
  const onHand = overviewRow?.onHand ?? lots.reduce((sum, lot) => sum + lot.remainingQty, 0);
  return {
    variant: toVariantSummary(variant),
    onHand,
    reserved,
    available: onHand - reserved,
    lots,
  };
};

/**
 * Movement history, newest first, keyset paginated on (occurred_at, id).
 *
 * Used by both GET /movements and GET /inventory/:variantId/movements; the
 * second one just pins `variantId`. `limit + 1` rows are fetched so the extra
 * row only produces the next cursor.
 */
export const listMovements = async (
  ctx: ServiceContext,
  query: ListMovementsQuery,
): Promise<Page<Movement>> => {
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const rows = await movementRepo.listHistory(ctx.db(), {
    orgId: ctx.auth.orgId,
    variantId: query.variantId ? asVariantId(query.variantId) : undefined,
    reason: query.reason,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    before: cursor ? { at: new Date(cursor.at), id: cursor.id } : undefined,
    limit: query.limit + 1,
  });

  const items = rows.slice(0, query.limit).map(toMovementView);
  const lastRow = rows.at(query.limit - 1);
  const nextCursor =
    rows.length > query.limit && lastRow
      ? encodeCursor({ at: lastRow.occurredAt.toISOString(), id: lastRow.id })
      : null;
  return { items, nextCursor };
};

/**
 * HistoryRow -> Movement wire mapper. The movement's unit cost is the average
 * of its lot slices (costTotal / |qtyDelta|); the exact split rides in
 * `consumptions` where the reversal flow needs it.
 */
export const toMovementView = (row: movementRepo.HistoryRow): Movement => ({
  id: row.id,
  variantId: row.variantId,
  sku: row.sku,
  name: row.productName,
  reason: row.reason,
  qtyDelta: row.qtyDelta,
  qtyAfter: row.qtyAfter,
  warehouseId: row.warehouseId,
  channelId: row.channelId ?? undefined,
  orderId: row.orderId ?? undefined,
  note: row.note ?? undefined,
  occurredAt: row.occurredAt.toISOString(),
  createdBy: row.createdBy ?? undefined,
  unitCost: row.qtyDelta === 0 ? 0 : Math.round(row.costTotal / Math.abs(row.qtyDelta)),
  totalCost: row.costTotal,
});

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
