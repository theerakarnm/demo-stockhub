/**
 * The whole database schema.
 *
 * `createDb()` passes this module to drizzle as the schema object, which is
 * what powers `db.query.<table>.findMany({ with: ... })` and the typed insert
 * helpers. drizzle-kit reads the same files through ./src/schema/*.ts.
 */

export * from './_shared';
export * from './enums';
export * from './org';
export * from './catalog';
export * from './channels';
export * from './inventory';
export * from './orders';
export * from './imports';
export * from './customers';
export * from './pricing';
export * from './relations';
