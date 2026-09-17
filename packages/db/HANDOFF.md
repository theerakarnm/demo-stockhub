# packages/db - handoff

`@stockhub/db`: the PostgreSQL data layer. Drizzle ORM schema, migration config, a thin
repository layer, and the demo seed. No business rules live here - they belong in `@stockhub/core`.

## Files created

```
packages/db/
  package.json                     scripts: generate, migrate, push, studio, seed, build, typecheck, lint
  tsconfig.json                    extends ../../tsconfig.base.json, types: ['bun']
  drizzle.config.ts                dialect postgresql, schema ./src/schema/*.ts, out ./drizzle
  README.md                        start postgres, migrate, seed, the generate-and-commit rule
  HANDOFF.md                       this file
  drizzle/.gitkeep                 generated migrations land here and are committed
  src/
    index.ts                       public surface: client, repositories, schema namespace, row types
    client.ts                      createDb / createPostgresClient / createDbFromClient, Db, DbExecutor
    schema/
      _shared.ts                   column conventions (ids, money, timestamps) - read first
      enums.ts                     pgEnum mirrors + ENUM_SYNC_GUARD compile-time drift check
      org.ts                       organizations, users, orgIdColumn() helper
      catalog.ts                   products, variants, bundle_components
      channels.ts                  channels, channel_listings
      inventory.ts                 warehouses, stock_movements, stock_lots, movement_lot_consumptions
      orders.ts                    orders, order_lines
      imports.ts                   import_batches
      relations.ts                 every drizzle relations() in one file
      index.ts                     re-exports
    repositories/
      index.ts                     namespaced exports (inventoryRepo, movementRepo, ...)
      inventory-repo.ts            getOpenLotsForUpdate (real, FOR UPDATE), getOnHandByVariant (real),
                                   getStockOverview (stub), applyLotDeltas (stub)
      movement-repo.ts             listHistory (real), recordMovements (stub), listMovementsForOrder (stub)
      import-repo.ts               createBatch/updateBatch/getBatch/listBatches (real),
                                   getBatchPreview (stub), applyBatch (stub)
      order-repo.ts                upsertOrder (real, idempotent), replaceOrderLines (real),
                                   listOrders (real), resolveOrderLineMatch (stub), applyStatusChange (stub)
      catalog-repo.ts              getVariantBySku, listCatalog, getBundleComponentMap,
                                   buildMatchIndex (all real), upsertProduct (stub)
    seed/
      data.ts                      the demo data, deterministic uuids
      index.ts                     the runner (truncate + insert, in one transaction)
```

## Key decisions

1. **Primary keys are `uuid` with `defaultRandom()`**, not text cuid/nanoid.
   The database generates the id, so any runtime (Bun, the Worker, psql, a data fix) can insert
   without an id library, and foreign keys stay 16 bytes. Cost of the choice: uuid v4 is not time
   sortable, so every "newest first" query orders by a timestamp column. Documented in
   `src/schema/_shared.ts`.

2. **Money is `bigint` in satang with `{ mode: 'number' }`.**
   `Number.MAX_SAFE_INTEGER` is ~90 trillion baht, far beyond an SME, so a JS number is safe and
   avoids BigInt noise in every call site. Never `numeric`/`real` - float drift breaks FIFO layers.

3. **Enums are literal tuples here, not imported from core at runtime.**
   drizzle-kit loads the schema outside Bun, so a runtime import of the workspace package would tie
   migrations to the workspace resolver. Instead `ENUM_SYNC_GUARD` in `src/schema/enums.ts` is a
   type-level equality check against the core unions: if the lists drift, `bun run typecheck` fails
   on the drifting line.

4. **All `relations()` live in `src/schema/relations.ts`.**
   Relations are declared in pairs, so co-locating them would force schema files to import each
   other in both directions. One file means no import cycles.

5. **One driver for both runtimes: postgres.js.**
   Hyperdrive hands a Worker a normal Postgres connection string, so the same driver, schema and
   repositories run locally and on Cloudflare. `createDb(url, { runtime: 'worker' })` switches to
   `max: 5`, `fetch_types: false`, `prepare: false`. The Hyperdrive binding snippet is in
   `src/client.ts`.

6. **`DbExecutor` is `Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>`**, not
   `Db | DbTransaction`. The union makes TypeScript reject `.select()`; the structural subset
   accepts both the pool handle and a transaction handle with no casts. Every repository function
   takes it as the first argument, and no repository opens its own transaction - the caller decides.

7. **`stock_movements` is append only**, and `movement_lot_consumptions` records which lot each
   outbound movement ate and at what unit cost. That table is what makes a COGS number explainable
   in the UI and what `restoreFifo` reads so a return credits the original cost, not today's price.

8. **`stock_lots.source_movement_id` has a FK to `stock_movements`, but there is no back-reference**,
   which keeps the two tables free of a circular foreign key.

9. **Idempotent re-import** is enforced by the unique index `orders(channel_id, external_order_id)`
   plus `upsertOrder`'s `onConflictDoUpdate`. `created_at` and `import_batch_id` are deliberately not
   overwritten, so the audit trail still points at the file that first introduced the order.

10. **The seed truncates**, so it refuses any host that is not localhost/127.0.0.1/postgres unless
    `SEED_FORCE=1`.

## Indexes worth knowing

- `stock_lots_fifo_idx (variant_id, warehouse_id, received_at, id)` - the FIFO pick. Turn it into a
  partial index with `WHERE remaining_qty > 0` once the table is large.
- `stock_movements_variant_occurred_idx` and `stock_movements_org_occurred_idx` - movement history.
- `orders_channel_ordered_idx`, `orders_org_ordered_idx`, `orders_org_status_idx` - order lists.
- `orders_channel_external_uq` - re-import idempotency. Do not drop it.
- `channel_listings_channel_sku_uq` - the import matcher lookup.
- `variants_org_sku_uq` - one SKU is one variant per tenant.
- `org_id` index on every business table.

## Dependencies added

| package | version | why |
| --- | --- | --- |
| `drizzle-orm` | ^0.38.3 | schema + query builder |
| `postgres` | ^3.4.5 | postgres.js driver, works locally and behind Hyperdrive |
| `@stockhub/core` | workspace:* | enums, branded ids, money, errors, port types |
| `drizzle-kit` (dev) | ^0.30.1 | migration generation, studio |
| `@types/bun` (dev) | ^1.1.14 | `process.env` and Bun globals for the seed runner |
| `typescript` (dev) | ^5.7.2 | matches the root version |

Nothing was installed. `bun install` is the lead agent's job.
`drizzle-kit generate` has not been run either (no database is up), so `drizzle/` is still empty.

## What the next developer must implement

Ordered by value. Grep `NotImplementedError` to find them all.

1. **`inventoryRepo.applyLotDeltas`** - one guarded `UPDATE` per lot
   (`WHERE id = :id AND remaining_qty >= :qty`), check the affected row count, abort on 0.
2. **`movementRepo.recordMovements`** - insert the ledger rows, the consumption rows, the new lot
   for inbound, and the lot restores for a return/cancel. Must run inside the caller's transaction.
3. **`importRepo.applyBatch`** - the transaction that sells the product:
   expandBundles -> getOpenLotsForUpdate -> planMovements -> recordMovements -> status `applied`.
   All or nothing.
4. **`inventoryRepo.getStockOverview`** - the main stock screen. The SQL is written out in the
   doc comment; bundles need a second pass through `bundleAvailability` from core.
5. **`orderRepo.resolveOrderLineMatch`** - update the line AND upsert the `channel_listings` row
   with `match_source = 'manual'`. Doing only the first half is the classic bug.
6. **`orderRepo.applyStatusChange`** - the pending/shipped/cancelled/returned decision table in the
   doc comment. Always read the existing movements first so you never restore stock that was never
   deducted.
7. **`importRepo.getBatchPreview`** and **`catalogRepo.upsertProduct`**.
8. **First migration**: `bun run docker:up && bun run db:generate && bun run db:migrate && bun run db:seed`,
   then commit the SQL in `drizzle/`.
9. **An integrity check job**: `SUM(stock_movements.qty_delta)` must equal `SUM(stock_lots.remaining_qty)`
   per (variant, warehouse). Write it before the first real customer.
10. **Auth**: `users` has no credential column on purpose. Add one, or an external identity id,
    when real auth replaces the demo role switcher.
