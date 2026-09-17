/**
 * Inventory: the shared stock pool that every channel sells from.
 *
 * Routes:
 *   GET /                              list + search + low stock filter
 *   GET /:variantId                    one variant with its FIFO lots
 *   GET /:variantId/movements          that variant's stock history
 *   POST /adjust                       manual correction (stock:adjust)
 *
 * The list is the screen that proves the role feature: avgUnitCost and stockValue
 * are in the handler's payload and vanish in ok() for a role without cost:read.
 */

import { StockHubError } from '@stockhub/core';
import { Hono } from 'hono';
import { MOCK_LOTS, MOCK_MOVEMENTS, MOCK_STOCK_ROWS } from '../lib/mock-data';
import { ok, paginated } from '../lib/response';
import { validate } from '../lib/validate';
import { requirePermission } from '../middleware/require-permission';
import { adjustStockBody, listInventoryQuery, variantParam } from '../schemas/inventory';
import { listMovementsQuery } from '../schemas/movements';
import { serviceContext } from '../services/context';
import { adjustStock } from '../services/inventory-service';
import type { AppEnv } from '../types/app';
import type { StockRow, VariantDetail } from '../types/contract';

export const inventoryRouter = new Hono<AppEnv>()
  .get('/', requirePermission('stock:read'), validate('query', listInventoryQuery), (c) => {
    const { q, lowStock, limit } = c.req.valid('query');

    // MOCK: replace the whole block with
    //   const page = await listInventory(serviceContext(c), c.req.valid('query'));
    //   return ok(c, page);
    // The filtering below only exists so the demo search box really filters.
    const needle = q?.toLowerCase();
    const rows: StockRow[] = MOCK_STOCK_ROWS.filter((row) => {
      const matchesText =
        !needle ||
        row.sku.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle);
      const matchesLowStock = !lowStock || row.available <= row.lowStockThreshold;
      return matchesText && matchesLowStock;
    }).slice(0, limit);

    // nextCursor stays null: the mock set fits in one page. Real code returns
    // encodeCursor({ at, id }) from the last row when limit + 1 rows came back.
    return paginated(c, rows, null);
  })
  .get('/:variantId', requirePermission('stock:read'), validate('param', variantParam), (c) => {
    const { variantId } = c.req.valid('param');

    // MOCK: replace with
    //   await getVariantDetail(serviceContext(c), asVariantId(variantId))
    // Branded ids (asVariantId) are created at this boundary, never inside a service.
    const variant = MOCK_STOCK_ROWS.find((row) => row.variantId === variantId);
    if (!variant) {
      throw new StockHubError('not_found', `Variant ${variantId} not found`, { variantId });
    }

    const detail: VariantDetail = {
      variant,
      onHand: variant.onHand,
      // `lots` is a cost field: stripCost() removes the whole key for a role
      // without cost:read, so a warehouse user sees quantities only.
      lots: variant.kind === 'bundle' ? [] : MOCK_LOTS,
    };
    return ok(c, detail);
  })
  .get(
    '/:variantId/movements',
    requirePermission('stock:read'),
    validate('param', variantParam),
    validate('query', listMovementsQuery),
    (c) => {
      const { variantId } = c.req.valid('param');

      // MOCK: replace with
      //   await listMovements(serviceContext(c), { ...query, variantId })
      const items = MOCK_MOVEMENTS.filter((movement) => movement.variantId === variantId);
      return paginated(c, items, null);
    },
  )
  .post(
    '/adjust',
    // Adjusting stock needs stock:adjust. Setting the cost of an inbound
    // adjustment additionally needs cost:write, checked inside the service.
    requirePermission('stock:adjust'),
    validate('json', adjustStockBody),
    async (c) => {
      // Real path already wired: the service throws NotImplementedError, which
      // middleware/error.ts turns into HTTP 501 with a machine readable code.
      const movement = await adjustStock(serviceContext(c), c.req.valid('json'));
      return ok(c, movement, 201);
    },
  );
