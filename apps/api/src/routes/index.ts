/**
 * Router barrel. `src/index.ts` mounts exactly what is listed here, so adding a
 * resource is: create the file, export it here, mount it there.
 */

export { catalogRouter } from './catalog';
export { channelsRouter } from './channels';
export { customersRouter } from './customers';
export { dashboardRouter } from './dashboard';
export { healthRouter } from './health';
export { importsRouter } from './imports';
export { inventoryRouter } from './inventory';
export { listingsRouter } from './listings';
export { meRouter } from './me';
export { movementsRouter } from './movements';
export { ordersRouter } from './orders';
export { priceTiersRouter } from './price-tiers';
export { pricingRouter } from './pricing';
export { reportsRouter } from './reports';
