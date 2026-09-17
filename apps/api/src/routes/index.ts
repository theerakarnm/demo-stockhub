/**
 * Router barrel. `src/index.ts` mounts exactly what is listed here, so adding a
 * resource is: create the file, export it here, mount it there.
 */

export { channelsRouter } from './channels';
export { dashboardRouter } from './dashboard';
export { healthRouter } from './health';
export { importsRouter } from './imports';
export { inventoryRouter } from './inventory';
export { meRouter } from './me';
export { movementsRouter } from './movements';
export { ordersRouter } from './orders';
export { reportsRouter } from './reports';
