/**
 * @stockhub/adapters - marketplace order-source adapters.
 *
 * The public surface is deliberately tiny:
 *   - `detectAdapter(file)` / `detectAll(file)` - which platform is this file?
 *   - `getAdapter(kind)`                        - give me that platform's reader
 *   - `adapters`                                - everything we support
 *
 * Callers (apps/api) work against the `OrderSourceAdapter` port from
 * @stockhub/core and never import a concrete adapter class.
 */

export * from './registry';
export { LazadaOrderAdapter, lazadaAdapter } from './lazada/adapter';
export { LAZADA_COLUMNS, type LazadaColumn } from './lazada/columns';
export { LAZADA_STATUS_MAP, mapLazadaStatus } from './lazada/status-map';
export { ShopeeOrderAdapter, shopeeAdapter } from './shopee/adapter';
export { SHOPEE_COLUMNS, type ShopeeColumn } from './shopee/columns';
export { SHOPEE_STATUS_MAP, mapShopeeStatus } from './shopee/status-map';
export { TiktokOrderAdapter, tiktokAdapter } from './tiktok/adapter';
export { TIKTOK_COLUMNS, type TiktokColumn } from './tiktok/columns';
export { TIKTOK_STATUS_MAP, mapTiktokStatus } from './tiktok/status-map';

/** Shared plumbing is exported too - apps/api reuses it for manual CSV uploads. */
export * from './shared';
