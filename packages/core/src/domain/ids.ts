/**
 * Branded id types.
 *
 * They are plain strings at runtime, but the brand stops you from passing a
 * ProductId where a VariantId is expected. Create them with the helpers below.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrgId = Brand<string, 'OrgId'>;
export type UserId = Brand<string, 'UserId'>;
export type ChannelId = Brand<string, 'ChannelId'>;
export type ProductId = Brand<string, 'ProductId'>;
export type VariantId = Brand<string, 'VariantId'>;
export type WarehouseId = Brand<string, 'WarehouseId'>;
export type StockLotId = Brand<string, 'StockLotId'>;
export type MovementId = Brand<string, 'MovementId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type OrderLineId = Brand<string, 'OrderLineId'>;
export type ImportBatchId = Brand<string, 'ImportBatchId'>;
export type PriceTierId = Brand<string, 'PriceTierId'>;
export type CustomerId = Brand<string, 'CustomerId'>;

export const asOrgId = (v: string) => v as OrgId;
export const asUserId = (v: string) => v as UserId;
export const asChannelId = (v: string) => v as ChannelId;
export const asProductId = (v: string) => v as ProductId;
export const asVariantId = (v: string) => v as VariantId;
export const asWarehouseId = (v: string) => v as WarehouseId;
export const asStockLotId = (v: string) => v as StockLotId;
export const asMovementId = (v: string) => v as MovementId;
export const asOrderId = (v: string) => v as OrderId;
export const asOrderLineId = (v: string) => v as OrderLineId;
export const asImportBatchId = (v: string) => v as ImportBatchId;
export const asPriceTierId = (v: string) => v as PriceTierId;
export const asCustomerId = (v: string) => v as CustomerId;
