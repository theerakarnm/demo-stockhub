/**
 * @stockhub/core - framework-free domain layer.
 *
 * Nothing in here may import Next.js, Hono, Drizzle, or the Cloudflare runtime.
 * That rule is what keeps the business rules testable with plain `bun test`
 * and portable if the delivery layer ever changes.
 */

export * from './domain';
export * from './errors';
export * from './ports';
export * from './rbac';
export * from './services/costing/fifo';
export * from './services/import/matching';
export * from './services/stock/bundle';
export * from './services/stock/movement';
export * from './services/pricing/resolve-price';
export * from './services/stock/order-transition';
export * from './services/pricing/resolve-price';
