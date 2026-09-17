# @stockhub/db

PostgreSQL data layer for StockHub: Drizzle ORM schema, migrations, repositories and the demo seed.

## Start Postgres

From the repo root:

```bash
cp .env.example .env        # DATABASE_URL points at the compose instance
bun run docker:up           # postgres:16 on localhost:5435 (via podman-compose)
```

The compose file maps host port **5435** because 5432-5434 are taken by other
projects on the development machine. `bun run docker:up` uses `podman-compose`;
on a machine with Docker, `docker compose up -d` is equivalent.

## Migrations

```bash
bun run db:generate         # schema TS -> packages/db/drizzle/*.sql
bun run db:migrate          # apply pending SQL to DATABASE_URL
bun run db:studio           # browse the data
```

`drizzle-kit` reads `DATABASE_URL` from the environment.
If your shell does not export it, run the command with the file:

```bash
cd packages/db && bun --env-file=../../.env run generate
```

### The rule

**Schema change => `bun run db:generate` => commit the generated SQL.**

The files in `drizzle/` are the migration history.
They are reviewed like any other code, and they are what runs in production.
Never edit a SQL file that has already been applied somewhere; write a new migration instead.

`bun run db:push` skips the SQL files and pushes the schema straight into the database.
It is fine on your own dev database while you are still shaping a table.
It is never acceptable on staging or production.

## Seed

```bash
bun run db:seed             # TRUNCATE + insert the demo data
```

The seed is idempotent: every id is a literal, so a second run rebuilds the same database.
It refuses to run against a non-local host unless `SEED_FORCE=1` is set, because it truncates.

What you get: one shop (`ร้านเกษตรรุ่งเรือง`), 4 users (one per role), 8 channels
(6 online + POS + wholesale), 17 products / 18 variants including 2 bundles, 30 purchase lots at
rising costs, 7 learned SKU mappings, 1 import batch waiting in `preview_ready`, and 4 demo orders.

## Layout

```
src/
  client.ts           createDb() / createPostgresClient(), the Db type
  schema/
    _shared.ts        column conventions - read this first
    enums.ts          pgEnum mirrors of @stockhub/core enums
    org.ts            organizations, users
    catalog.ts        products, variants, bundle_components
    channels.ts       channels, channel_listings
    inventory.ts      warehouses, stock_movements, stock_lots, movement_lot_consumptions
    orders.ts         orders, order_lines
    imports.ts        import_batches
    relations.ts      every drizzle relations() in one file (no import cycles)
  repositories/       thin query layer, no business rules
  seed/
    data.ts           the demo data
    index.ts          the runner
drizzle/              generated migrations - commit them
```

## Working with the schema

- Money columns are `bigint` holding **satang** (1 THB = 100 satang). See `packages/core/src/domain/money.ts`.
- Primary keys are `uuid` with `defaultRandom()`. Order by a timestamp, never by id.
- Every business table has `org_id` with an index. Always filter by it.
- Adding an enum value means editing `packages/core/src/domain/enums.ts` **and** `src/schema/enums.ts`.
  The `ENUM_SYNC_GUARD` in that file fails `bun run typecheck` if you forget one side.

## Concurrency

Any code path that consumes FIFO lots must run inside a transaction and lock the lots first:

```ts
await db.transaction(async (tx) => {
  const lots = await inventoryRepo.getOpenLotsForUpdate(tx, { orgId, variantId, warehouseId });
  const result = consumeFifo(lots, qty, { onShortage: 'shortfall' });
  await movementRepo.recordMovements(tx, { orgId, planned: [...] });
});
```

Without `SELECT ... FOR UPDATE` two parallel imports read the same `remaining_qty` and the shop oversells.
