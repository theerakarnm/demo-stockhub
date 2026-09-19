# Profit Report (brief item L) Implementation Plan

> **Run with:** `/execute-plan docs/plans/2026-09-19-profit-report.md` - the runner that ticks these
> checkboxes and honours the track/merge layout below.
>
> **For the executing agent:** Implement track-by-track. This plan has ONE sequential
> track (see Execution), so work the tasks top to bottom in one worktree.
> Steps use checkbox (`- [ ]`) syntax for tracking; tick them as you go.
> Run the `## Preflight` checks BEFORE task L0 and report anything down.

**Goal:** Show real profit per order and per channel, computed from the FIFO ledger the engine actually wrote, minus platform fees whose source is explicit for every order.
**Architecture:** Fees become stored facts on the order (`orders.platform_fee` + `orders.fee_source`), written once when the order enters the system and never silently recomputed. A new `GET /api/v1/reports/profit` reads orders joined to their `sale_out` / `return_in` / `cancel_restore` movements, applies one pure profit function from `packages/core`, and is blocked for roles without `cost:read` exactly like `/reports/cogs`. The web gets a `/reports/profit` screen next to the COGS report plus a small manual fee override on the order detail page.
**Tech Stack:** Bun 1.3.5 workspaces, TypeScript 5 strict, Hono 4 on Cloudflare Workers, Drizzle ORM + PostgreSQL 16, Next.js 15 / React 19 / Tailwind 4, Biome, `bun test`. No new dependencies.
**Spec:** none - planned from conversation. The brief item is quoted verbatim below so scope can be audited line by line.
**Base commit:** `83d899a` (`main` at planning time, "Tick the last wave 3 box"). Every anchor and "already exists" claim below was verified against THIS tree on 2026-09-19.
**Confidence:** 8/10. Rubric arithmetic: 10, minus 0 (every `Consumes:` entry carries a full signature), minus 0 (every Patterns-to-Mirror source was read from the live tree today), minus 0 (both Human checks have proxies), minus 0 (every NOT-building cut cites a file), minus 0 (the schema task lists its inferred-type consumers), minus 0 (every Preflight check was executed while planning, including the failing ones), minus 0 (single sequential track, no cost-floor question), then two explicit charges: -1 the seeded fee rates (Shopee 14% / Lazada 13% / TikTok 12%) are `// VERIFY:` guesses until the customer's settlement documents arrive; -1 `main` is actively moving (wave 3 merged hours ago), so a later merge can shift anchors - run the re-base checklist if `git log 83d899a..HEAD` is not empty.
**NOT building:**
- A screen to edit channel fee rates. Channel management edits were cut in wave 2 and stay cut; the rate is seeded data until `PATCH /api/v1/channels/:id` exists (`apps/web/src/app/settings/channels/page.tsx:75`, comment: "TODO(template): enable once PATCH /api/v1/channels/:id exists").
- Reading fees from settlement / wallet export files (`feeSource: 'exported'` is reserved, unused). `NormalizedOrder` carries no fee field today (`packages/core/src/ports/order-source.ts:48-62`) and no adapter parses settlement files.
- Backfilling fees onto orders that predate this feature. Seed orders and existing rows keep `fee_source = 'none'`, `platform_fee = 0`; the report treats them as fee-free and the order detail page says so.
- Line-exact return accounting. Returns are prorated by unit ratio at the order level; per-line refunds are not recorded as money anywhere today (`returnOrder`, `apps/api/src/services/order-service.ts:608-725`, writes movements and a status only). A partial return of a mixed-price order can differ from the exact refund by rounding.
- CSV / PDF export of the report, and a profit tile on the dashboard. The brief asks for per-order and per-channel views only.
- Extending the seed with sold orders. The seed contains zero `sale_out` movements (`packages/db/src/seed/index.ts:136`, comment: "Nothing has been sold in the seed"), and adding them would shift every on-hand-absolute assertion in `inventory.test.ts`, `inventory-write.test.ts`, `catalog.test.ts` and `guards.integration.test.ts`. The demo journey creates real sales via import + bill instead.

## Spec (verbatim)

The user's brief item, kept as written.

> **L รายงานกำไร (ต้องรอ F, H, E)** แสดงกำไรจริงต่อออเดอร์และต่อช่องทาง โดยใช้ทุน FIFO และหักค่าธรรมเนียมแพลตฟอร์ม ต้องคิดว่าจะได้ค่าธรรมเนียมมาจากไหนถ้าไฟล์ export ไม่มีข้อมูลนี้ และรายงานนี้ต้องผ่านการกรองสิทธิ์จากงาน E

Dependency status, verified on `main` at `83d899a`:

- **A / B / C / D** (FIFO, adapters, matching, tiers) - merged in waves 1-2.
- **E** (cost-hiding permissions) - merged in wave 2: `FIELD_POLICIES` + `redactForRole` in `packages/core/src/rbac.ts`, enforced by `redactMiddleware`, audited by `apps/api/src/contract-audit.test.ts` (both directions) and `apps/api/src/leak-scan.test.ts`.
- **F** (import pipeline) - merged in wave 3: `applyImport` upserts orders, consumes FIFO lots in one transaction, restores on later cancel/return.
- **H** (billing screen) - merged in wave 3: `createPosOrder` / `cancelOrder` / `returnOrder` plus `/orders/new` and `/orders/[id]`.

Every dependency of L is therefore on `main`. Nothing in this plan waits.

## Decisions (the fee question, answered)

The brief's open question is "ต้องคิดว่าจะได้ค่าธรรมเนียมมาจากไหนถ้าไฟล์ export ไม่มีข้อมูลนี้". Marketplace ORDER exports carry no commission or payment fee - those live in separate settlement statements that no adapter parses today. The answer has four parts.

- **D1 - Fees are stored on the order, once.** Two new columns: `orders.platform_fee` (satang) and `orders.fee_source`. They are written when the order enters the system and never recomputed by the report, so a rate change next month cannot rewrite history. This follows the same evidence rule as `movement_lot_consumptions.unitCost` ("copied from the lot at consume time, so later edits cannot rewrite history").
- **D2 - The default rate lives on the channel, in basis points.** `channels.fee_rate_bps` (integer, 0-10000) keeps the money-integer rule for percentages. Seeded demo rates, all marked `// VERIFY:` because they are guesses: Shopee 1400 (14%), Lazada 1300 (13%), TikTok 1200 (12%), and 0 for `pos` / `wholesale` / `manual`.
- **D3 - Four fee sources, layered.** `manual` (a person typed the fee, via the Task L4 endpoint) beats `channel_default` (computed from `fee_rate_bps` at import time by the Task L2 function). `exported` is reserved for a future settlement-file pipeline. `none` means no fee applies (POS / wholesale / manual bills, or an order that predates this feature). A re-import never overwrites an existing fee, so a manual fee survives any re-upload. Accepted wrinkle (recorded on purpose): `upsertOrder` DOES refresh `grandTotal` on a re-import (`packages/db/src/repositories/order-repo.ts:47`), so a corrected file can leave a stored `channel_default` fee that no longer equals the rate times the stored total - the stored fee stays the audit fact, and the real correction path is a future settlement import (`exported`).
- **D4 - Profit is net of returns, computed from ledger truth.** For each order that has at least one `sale_out` movement: `netCogs = sum(sale_out.costTotal) - sum(return_in.costTotal + cancel_restore.costTotal)`; `netUnits = unitsSold - unitsReturned`; when `netUnits` is 0 the order contributes all zeros (the goods came home); otherwise revenue and fee are prorated by `netUnits / unitsSold` (rounded half up, once per order) and `profit = revenue - fee - netCogs`. The window filter is `orders.ordered_at` (business time, Bangkok day boundaries like the COGS report).
- **D5 - Permission shape copied from the COGS report.** The whole profit report is cost data, so it is blocked at 403 with `requirePermission('report:read', 'cost:read')` instead of stripped field by field (`apps/api/src/routes/reports.ts:22-31` establishes the pattern and its "an honest 403 beats an empty table" rationale). The manual fee endpoint requires `cost:write`, which only owner and manager hold. Every cost-bearing contract field also carries the `/** cost field */` marker and its key in `COST_KEYS`, which is what makes job E's automatic filtering and audits cover this feature with zero per-route code.
- **D6 - Test runner serialized.** At the base commit `bun test` fails 2-4 DB-backed tests non-deterministically because mutating suites (imports) run concurrently with seed-absolute suites (guards, inventory). Task L0 pins `--max-concurrency=1`, verified green (268 pass / 0 fail).

## Global Constraints

Inherited from `AGENTS.md` and the merged wave plans; every task implicitly includes these.

- `packages/core` must not import Next.js, Hono, Drizzle, React, or the Cloudflare runtime; core is tested with plain `bun test`.
- Money is always an integer in satang via the `Satang` type; never floats; percentages are integer basis points; convert only when displaying.
- Enums are edited in `packages/core/src/domain/enums.ts` first, mirrored in `packages/db/src/schema/enums.ts` (with an `ENUM_SYNC_GUARD` entry), then `bun run db:generate` from `packages/db`; commit the generated SQL, snapshot and journal; never hand-edit SQL.
- Every business table row is scoped by `org_id` and every repository query filters by it.
- Cost hiding is enforced at the API: every contract field whose name is in `COST_KEYS` carries `/** cost field */` on the line above, and every key in `COST_KEYS` carries the marker wherever it appears in `apps/api/src/types/contract*.ts` (the reverse audit in `apps/api/src/contract-audit.test.ts` enforces this). New cost keys go into `COST_KEYS` in the SAME commit as the field.
- Throw only `StockHubError` with a stable `code`; routes answer only through `ok()` / `paginated()`; new endpoints get a zod schema in `apps/api/src/schemas/`, `requirePermission(...)`, matching types in `apps/web/src/lib/api-types.ts`, a client function in `apps/web/src/lib/api-client.ts`, and a row in the `apps/api/README.md` contract table.
- TypeScript strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`: always `import type`, no `any`, no `!` non-null assertion.
- Files `kebab-case.ts`; types `PascalCase`; enum-set constants `SCREAMING_SNAKE_CASE` next to their type.
- Comments in English explaining why; on-screen text in Thai; Markdown one sentence per line; never the em dash character.
- Web pages fetch only through `apps/web/src/lib/` modules, render loading, empty and error states, wrap cost figures in `<CostValue>`, and gate with `hasPermission` / `PermissionGate`.
- Never log buyer data; commit subjects at most about 50 characters, imperative, one commit does one thing, never an AI co-author.

## Patterns to Mirror

### Whole-endpoint cost gate (the route shape L copies)
<!-- SOURCE: apps/api/src/routes/reports.ts:22-31 -->
```ts
  .get(
    '/cogs',
    // Both permissions: you must be allowed to read reports AND to see cost.
    requirePermission('report:read', 'cost:read'),
    validate('query', cogsReportQuery),
    async (c) => ok(c, await getCogsReport(serviceContext(c), c.req.valid('query'))),
  );
```

### Report window and day boundaries (Bangkok-inclusive)
<!-- SOURCE: apps/api/src/services/report-service.ts, getCogsReport -->
```ts
  const fromAt = new Date(`${query.from}T00:00:00+07:00`);
  const toAt = new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + MS_PER_DAY);
```

### Ledger aggregation SQL (raw drizzle sql, table-qualified subqueries, Number() mapping)
<!-- SOURCE: packages/db/src/repositories/movement-repo.ts:502-560, listCogsByDayChannel -->
```ts
      revenue: sql<number>`coalesce(sum((
          select coalesce(sum(ol.qty * ol.unit_price - ol.discount), 0)
          from order_lines ol
          where ol.order_id = stock_movements.order_id
            and ol.variant_id = stock_movements.variant_id
        )), 0)::bigint`.as('revenue'),
```
The header comment warns: inside a subquery, bare `order_id` / `movement_id` would correlate to the INNER table, so outer references stay table-qualified.

### Cost-field marker convention
<!-- SOURCE: apps/api/src/types/contract.ts:141-149 -->
```ts
export interface MovementConsumption {
  lotId: string;
  qty: number;
  /** cost field */
  unitCost: MoneyOnWire;
  /** cost field */
  lineCost: MoneyOnWire;
}
```

### Schema column conventions (money helper, check guard)
<!-- SOURCE: packages/db/src/schema/orders.ts:52-57 and 88-91 -->
```ts
    /** Sum of line totals after discount, in satang. */
    grandTotal: money('grand_total').notNull().default(0),
    ...
    check('orders_grand_total_nonneg', sql`${table.grandTotal} >= 0`),
```

### Repo integration test inside a rolled-back transaction
<!-- SOURCE: packages/db/src/repositories/listing-repo.integration.test.ts:26-40 -->
```ts
class Rollback extends Error {}

/** Run the body in a transaction, then undo everything it touched. */
const inRollback = async (fn: (tx: DbTransaction) => Promise<void>): Promise<void> => {
  if (!db) return;
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
};
```

### Web cost-gated report page (gate + CostValue + states)
<!-- SOURCE: apps/web/src/app/reports/cogs/page.tsx:15-27 and 54-57 -->
```ts
export default function CogsReportPage() {
  const { role, hasPermission } = useRole();
  const allowed = hasPermission('cost:read');
```
The page renders a locked note instead of fetching when `allowed` is false, and wraps every money cell in `<CostValue>`.

### Web API client with demo-mode mock fallback (flat method names, no grouping object)
<!-- SOURCE: apps/web/src/lib/api-client.ts:224-229 -->
```ts
  /** GET /api/v1/reports/cogs - 403 for roles without cost:read. */
  getCogsReport: (query: CogsQuery = {}): Promise<CogsReportResponse> =>
    demo(
      () => mockApi.cogsReport(query),
      () => request<CogsReportResponse>(withQuery('/api/v1/reports/cogs', { ...query })),
    ),
```

### Sidebar nav entry with permission
<!-- SOURCE: apps/web/src/components/sidebar.tsx:58-64 -->
```ts
  {
    href: '/reports/cogs',
    label: 'รายงานต้นทุน',
    icon: BarChart3,
    permission: 'cost:read',
    match: ['/reports'],
  },
```

### Upsert that refuses to clobber history
<!-- SOURCE: packages/db/src/repositories/order-repo.ts:29-51 -->
```ts
 * `onConflictDoUpdate` on the unique index is what makes a re-import safe. Note
 * what is NOT updated: created_at and import_batch_id keep pointing at the
 * first file that introduced the order, which keeps the audit trail stable.
```
The fee columns join the NOT-updated list for the same reason.

## Preflight

Define once per shell before any command below:

```bash
export PG_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
```
Never print or commit `PG_URL`; it stays a shell value.

### DURABLE - true until the repo itself changes

- [Bun 1.3.5 workspaces, bun lockfile] - Evidence: `package.json` `packageManager: bun@1.3.5`, root `bun.lock`. - Consequence: every install/run is `bun ...`; no npm/yarn files exist.
- [`bun test` auto-loads the root `.env`, but `bun run db:*` does NOT] - Evidence: `bun test` reached the database with no exported `DATABASE_URL` (measured), while `bun run db:seed` failed with "DATABASE_URL is not set" until the variable was passed explicitly. - Consequence: verify commands that need the DB for `bun test` work as-is; every `db:migrate` / `db:seed` / `drizzle-kit` invocation sets `DATABASE_URL="$PG_URL"` on the command line.
- [Postgres runs in podman on host port 5435] - Evidence: `docker-compose.yml` maps `5435:5432`, `package.json` uses `podman-compose`. - Consequence: probe with `podman ps`, never `docker ps`.
- [`drizzle-kit generate` refuses to run without `DATABASE_URL` even though generate never connects] - Evidence: `packages/db/drizzle.config.ts` throws. - Consequence: Task L1 exports the variable.
- [Demo auth identifies org and user by `x-demo-role` / `x-demo-org` headers; `asRole` / `jsonAs` in `apps/api/src/test-utils.ts` build them] - Evidence: `apps/api/src/test-utils.ts:107-140`. - Consequence: API verifies are `bun test` runs, not curls, except `## End-to-end verification`.
- [`bun test --max-concurrency=<n>` exists in Bun 1.3.5] - Evidence: `bun test --help` prints `--max-concurrency=<val> ... Default is 20`. - Consequence: Task L0's one-line fix is enough; no runner upgrade.
- [Contract audits run in both directions since wave 2] - Evidence: `apps/api/src/contract-audit.test.ts` test 3, "no set key appears without its marker". - Consequence: adding `fee` / `platformFee` / `feeSource` to `COST_KEYS` without marking every occurrence fails `bun test` immediately.
- [`-- VERIFY:` markers mean "a guessed value" per `AGENTS.md` section 1] - Evidence: AGENTS.md marker table. - Consequence: the seeded fee rates stay marked until the customer's real numbers arrive.

### PERISHABLE - recapture before task L0

- [Podman machine and the Postgres container are up] - Check: `podman ps --format '{{.Names}} {{.Status}}' | grep stockhub-postgres && pg_isready -h localhost -p 5435` - Needed by: Tasks L1, L3, L4, L5, L6 and end-to-end. If down: `podman machine start && podman start stockhub-postgres`.
  > Deviation (2026-09-19, run start): another agent session was concurrently executing its own plan against the shared `stockhub-postgres` (5435) and its seed TRUNCATE cycles corrupted DB-backed verifies both ways. With the user's approval this run now owns a PRIVATE database: container `stockhub-postgres-profit` (same image postgres:16-alpine, same creds, host port 5436), and this checkout's `.env` + `apps/api/.dev.vars` were repointed 5435 -> 5436. The shared 5435 container is untouched. All DB commands in this plan now resolve to 5436 through the same files, so no command changes. Ownership proof: migrate + seed green, `pg_stat_activity` shows only this run's connections.
- [`.env` carries a local DATABASE_URL] - Check: `grep -c '^DATABASE_URL=postgresql://localhost:5435/' .env` prints `1` (shape check only, never print the value) - Needed by: everything above.
  > Deviation: the grep prints `0` because the real URL carries credentials before the host (`postgresql://***@localhost:5435/stockhub`, masked). The substance holds - exactly one `DATABASE_URL` line, host `localhost:5435`, db `stockhub` - and `db:migrate` + `db:seed` ran green against it. Re-verified 2026-09-19 at the start of this run.
- [The shared `stockhub` database is migrated and freshly seeded] - Check: `DATABASE_URL="$PG_URL" bun run db:migrate && DATABASE_URL="$PG_URL" bun run db:seed` ends with "Seed complete"; measured output: 30 lots, 2822 units, stock value 379,245 baht, 4 orders / 7 lines - Needed by: all DB verifies. Re-seed also between experiments; the seed is idempotent (TRUNCATE list in `packages/db/src/seed/index.ts:54-72`).
- [Baseline counts at `83d899a`, before Task L0] - Check: `bun run typecheck` (all 6 packages exit 0, measured), `bun run lint` (all green, measured), `bun test` (measured NON-DETERMINISTIC: 264-266 pass with 2-4 fail - the failing tests are `guards.integration.test.ts` "keeps the seed invariant", `routes/inventory.test.ts` "movements list returns the seed ledger", `routes/inventory-write.test.ts` "manager receives 5 pairs", `repositories/inventory-repo.integration.test.ts` "hoe history shows the running balance"; all four are DB suites racing the mutating import suite) - Needed by: Task L0's verify. After Task L0: `bun run test` prints `268 pass, 0 fail` deterministically (measured twice with `--max-concurrency=1`).
- [Dependencies installed in THIS checkout] - Check: `test -d node_modules && bun run typecheck` exits 0 - Needed by: every task.
- [Free ports for end-to-end] - Check: `lsof -i :8788 -sTCP:LISTEN` and `lsof -i :3100 -sTCP:LISTEN` print nothing - Needed by: `## End-to-end verification`.
- [Migration count at base] - Check: `ls packages/db/drizzle/*.sql` - measured at base: THREE files (`0000_init.sql`, `0001_price_tiers_customers.sql`, `0002_true_valkyrie.sql`), so Task L1 generates `0003_platform_fees` - Needed by: Task L1's generate step and the re-base checklist (a count other than three at start, or beyond 0003 before L1 runs, means another checkout migrated last - STOP per Failure handling).

## Execution

**Tracks:** one sequential track, tasks L0 through L9, in one worktree on a branch cut from `main`. No treehouse leases (the work is a single dependency chain; every task after L2 consumes the schema or the core math).

**Shared files:** not applicable across parallel tracks (there are none). Files touched by several tasks anyway: `apps/api/src/types/contract.ts` (L4, L6), `apps/api/src/services/order-service.ts` (L4 only), `apps/web/src/lib/api-types.ts` (L4 mirror via L7, L7), `apps/api/src/routes/orders.test.ts` (L4), `packages/db/src/schema/*` (L1 only). The plan orders tasks so no file is edited by two open tasks.

**Merge order:** single branch, `git checkout -b profit-report 83d899a`, one commit per task, merge to `main` after `## End-to-end verification`.

**Re-base checklist:** if `git log --oneline 83d899a..HEAD` is not empty when you start (or becomes non-empty mid-run), re-verify every anchor below against the new HEAD before trusting the affected task, and re-run the Preflight baseline.

---

### Track L - profit report

#### Task L0: Serialize the test runner (fixes the pre-existing red)

**Files:**
- Modify: `package.json` (anchor: `"test": "bun test"`, ~L14)

**Interfaces:**
- Consumes: nothing.
- Produces: `bun run test` that is deterministic; every later task's `bun test` verify relies on it.

**Gotcha:** the four baseline-failing tests are NOT broken by this plan and must not be "fixed" here. They fail because bun executes test files concurrently (default `--max-concurrency=20`) and the import suites mutate the shared ledger while the seed-absolute suites read it. Measured evidence: after a fresh `db:seed` the invariant query returns 0 broken rows; `bun test packages/db/src/guards.integration.test.ts` alone right after a full suite fails; `bun test --max-concurrency=1` prints 268 pass / 0 fail.

**Steps:**
- [ ] Step 1: Change the root script to
      ```json
      "test": "bun test --max-concurrency=1",
      ```
      and add one `//`-style reason where the script block allows a comment line above it in the scripts object (JSON has no comments - instead, if `package.json` has no place for the why, note it in the commit body: "DB-backed suites share one Postgres; serialized files keep the seed-absolute assertions deterministic").
- [ ] Step 2: Verify - Run: `bun run test` twice in a row - Expected: both runs print `268 pass` / `0 fail` (with `DATABASE_URL` unset they print fewer passes and `0 fail` because DB suites skip; run with `.env` present, which `bun test` loads by itself).
- [ ] Step 3: Commit - `git commit -m "Serialize bun test files for deterministic DB suites"`

#### Task L1: Fee source enum, order fee columns, channel rate, migration

**Files:**
- Modify: `packages/core/src/domain/enums.ts` (anchor: `MATCH_SOURCES`, ~L71, append after that block)
- Modify: `packages/db/src/schema/enums.ts` (anchor: `matchSourceEnum`, ~L70; anchor: `ENUM_SYNC_GUARD`, ~L88)
- Modify: `packages/db/src/schema/orders.ts` (anchor: `grandTotal: money('grand_total')`, ~L52-57; anchor: the `checks` array `orders_grand_total_nonneg`, ~L91)
- Modify: `packages/db/src/schema/channels.ts` (anchor: `isActive: boolean('is_active')`, ~L26; anchor: the `channels_org_kind_idx` index block)
- Modify: `packages/db/src/seed/data.ts` (anchor: `export const SEED_CHANNELS`, ~L176-229)
- Create (generated): `packages/db/drizzle/0003_platform_fees.sql`, `packages/db/drizzle/meta/0003_snapshot.json`, append to `packages/db/drizzle/meta/_journal.json` - the base tree has three migrations (measured), so the next number is 0003; if `ls packages/db/drizzle/*.sql` shows otherwise, STOP per Failure handling

**Interfaces:**
- Consumes: the enum mirror pattern in `packages/db/src/schema/enums.ts` (comment block "KEEP IN SYNC" + `SameUnion` guard entries).
- Produces (consumed by L2, L3, L4, L5, L6):
  ```ts
  // packages/core/src/domain/enums.ts
  export const FEE_SOURCES = ['none', 'manual', 'channel_default', 'exported'] as const;
  export type FeeSource = (typeof FEE_SOURCES)[number];
  // packages/db rows gain:
  //   Order.platformFee: number (satang, default 0), Order.feeSource: FeeSource (default 'none')
  //   Channel.feeRateBps: number (default 0)
  ```

**Gotcha:** the enum mirror needs three edits in `packages/db/src/schema/enums.ts`, not one: the `import type` list gains `FeeSource`, the `feeSourceEnum` pgEnum is added, and `ENUM_SYNC_GUARD` gains `feeSource: true as SameUnion<(typeof feeSourceEnum.enumValues)[number], FeeSource>`. Skipping the guard entry silences the drift detector this repo deliberately built.

**Inferred-type consumers (checked, no edits needed):** `Order` / `NewOrder` gain two defaulted columns, so every existing `NewOrder` literal keeps compiling (`SEED_ORDERS` in `packages/db/src/seed/data.ts:999-1050`, `orders.test.ts` fixtures go through HTTP not literals). `Channel` / `NewChannel` literals exist only in `SEED_CHANNELS`, edited in this task. No test double constructs these rows by hand.

**Rollback:** the migration is additive. To reverse on a dev database: `DROP COLUMN` the two order columns and the channel column, `DROP TYPE fee_source`, delete the generated `0003_*` files and the journal entry. Nothing backfills data, so nothing else rewinds.

**Steps:**
- [x] Step 1: In `packages/core/src/domain/enums.ts` append
      ```ts
      /** Where an order's platform fee came from. Stored per order; never recomputed. */
      export const FEE_SOURCES = [
        'none', // POS / wholesale / manual bills, or orders from before fees existed
        'manual', // a person typed the fee on the order page
        'channel_default', // computed from channels.fee_rate_bps at import time
        'exported', // reserved: a future settlement-file pipeline
      ] as const;
      export type FeeSource = (typeof FEE_SOURCES)[number];
      ```
- [x] Step 2: Mirror in `packages/db/src/schema/enums.ts` (import type, `feeSourceEnum`, `ENUM_SYNC_GUARD.feeSource`).
- [x] Step 3: In `packages/db/src/schema/orders.ts` add after `grandTotal`
      ```ts
      /** Platform commission + payment fee actually charged, in satang. Written once at
       *  entry; a re-import or rate change never rewrites it (see upsertOrder). */
      platformFee: money('platform_fee').notNull().default(0),
      /** Which of FEE_SOURCES produced platformFee. */
      feeSource: feeSourceEnum('fee_source').notNull().default('none'),
      ```
      and a `check('orders_platform_fee_nonneg', sql`${table.platformFee} >= 0`)` next to `orders_grand_total_nonneg` (`packages/db/src/schema/orders.ts:78`).
- [x] Step 4: In `packages/db/src/schema/channels.ts` add
      ```ts
      /** Default marketplace commission in basis points (1400 = 14.00%). 0 for own channels. */
      feeRateBps: integer('fee_rate_bps').notNull().default(0),
      ```
      plus `check('channels_fee_rate_bps_range', sql`${table.feeRateBps} >= 0 AND ${table.feeRateBps} <= 10000`)`; import `integer` and `sql` if missing.
- [x] Step 5: Generate and read the migration: `cd packages/db && DATABASE_URL="$PG_URL" bunx drizzle-kit generate --name platform_fees` - Expected: the SQL contains `CREATE TYPE "fee_source"`, two `ALTER TABLE "orders" ADD COLUMN`, one `ALTER TABLE "channels" ADD COLUMN`, exactly two `ADD CONSTRAINT ... CHECK` (the two this task writes; `money()` adds no constraint), and no `DROP`.
  > Deviation: the Expected string `CREATE TYPE "fee_source"` appears namespaced as `CREATE TYPE "public"."fee_source"` in the generated SQL; same statement, all other Expected conditions hold exactly.
- [x] Step 6: Seed the demo rates on the six marketplace channels in `SEED_CHANNELS` (`shopeeMain`/`shopeeBranch` `feeRateBps: 1400`, `lazadaMain`/`lazadaMall` `1300`, `tiktokMain`/`tiktokLive` `1200`), each line annotated
      ```ts
      // VERIFY: guessed demo rate, check against the customer's real commission schedule.
      ```
      POS / wholesale / manual channels stay on the 0 default.
- [x] Step 7: Verify - Run: `DATABASE_URL="$PG_URL" bun run db:migrate && DATABASE_URL="$PG_URL" bun run db:seed` - Expected: both exit 0, seed prints "Seed complete"; then `cd packages/db && DATABASE_URL="$PG_URL" bunx drizzle-kit generate --name noop` prints "No schema changes, nothing to migrate"; then `bun run typecheck` exits 0 in all packages.
- [x] Step 8: Commit - `git commit -m "Add platform fee columns and fee source enum"`

#### Task L2: Core fee + profit math, pure and tested

**Files:**
- Create: `packages/core/src/services/profit/fee.ts`
- Modify: `packages/core/src/index.ts` (anchor: the last `export * from './services/...'` line, append one)
- Test:   `packages/core/src/services/profit/fee.test.ts`

**Interfaces:**
- Consumes: `FEE_SOURCES` / `FeeSource` and `IMPORTABLE_CHANNEL_KINDS` (`packages/core/src/domain/enums.ts`), `Satang` from `packages/core/src/domain/money.ts`.
- Produces (consumed by L3, L5, L6):
  ```ts
  export const computePlatformFee: (input: { channelKind: ChannelKind; feeRateBps: number; grandTotal: Satang }) => { fee: Satang; source: FeeSource };
  export interface OrderLedgerSums { grandTotal: Satang; platformFee: Satang; unitsSold: number; soldCost: Satang; restoredUnits: number; restoredCost: Satang }
  export interface OrderProfit { netUnits: number; revenue: Satang; fee: Satang; cogs: Satang; profit: Satang }
  export const orderProfit: (sums: OrderLedgerSums) => OrderProfit;
  ```
  Semantics (decision D4): marketplace kinds are exactly `IMPORTABLE_CHANNEL_KINDS`; the fee is `roundHalfUp(grandTotal * feeRateBps / 10000)` with source `channel_default`, or `0` / `none` for own channels. `orderProfit`: `netUnits = unitsSold - restoredUnits`; `netUnits <= 0` returns all zeros; otherwise `revenue = roundHalfUp(grandTotal * netUnits / unitsSold)`, `fee = roundHalfUp(platformFee * netUnits / unitsSold)`, `cogs = soldCost - restoredCost`, `profit = revenue - fee - cogs`.

**Steps:**
- [x] Step 1: Implement `fee.ts`. Keep it free of every framework import. Guard `unitsSold <= 0` defensively (the SQL in L5 only returns orders with a sale, so this is a stop-gap, not a contract).
      ```ts
      const roundHalfUp = (value: number): number => Math.floor(value + 0.5);

      export const computePlatformFee = (input: {
        channelKind: ChannelKind;
        feeRateBps: number;
        grandTotal: Satang;
      }): { fee: Satang; source: FeeSource } => {
        const marketplace = (IMPORTABLE_CHANNEL_KINDS as readonly ChannelKind[]).includes(input.channelKind);
        if (!marketplace) return { fee: 0, source: 'none' };
        // Money-integer rule: one rounding, half up, at the order level.
        const fee = roundHalfUp((input.grandTotal * input.feeRateBps) / 10_000);
        return { fee, source: 'channel_default' };
      };
      ```
  > Deviation: `Satang` is a branded type, so the reference code's raw-number returns do not typecheck; `roundHalfUp` now constructs through `satang()` and the no-fee branch returns `ZERO` from domain/money. While appending the new export in index.ts, also removed the duplicated `export * from './services/pricing/resolve-price'` line (no-op duplicate).
- [x] Step 2: Implement `orderProfit` in the same file with the exact semantics above; every division runs through `roundHalfUp` exactly once.
- [x] Step 3: Tests (pure, no DB): Shopee 1400 bps over 50500 gives `{ fee: 7070, source: 'channel_default' }`; rounding case grandTotal 333 at 1400 bps gives 47; `pos` gives `{ fee: 0, source: 'none' }`; TikTok with rate 0 gives fee 0 with source `channel_default`; `orderProfit` full sale (3 sold, 24000 cost, grandTotal 50000, fee 7000) gives profit 19000; partial return of 1 of 3 gives revenue 33333, fee 4667, cogs 16000, profit 12666; full return gives all zeros; a restoredCost above soldCost is impossible by construction, assert the function still never returns a negative cogs input pass-through (feeding restoredCost 24000 / soldCost 24000 with netUnits 0 gives zeros).
- [x] Step 4: Verify - Run: `bun test packages/core/src/services/profit/fee.test.ts && bun run --filter @stockhub/core typecheck && bun run --filter @stockhub/core lint` - Expected: 8 pass, 0 fail; typecheck and lint exit 0.
- [x] Step 5: Commit - `git commit -m "Add platform fee and order profit rules"`

#### Task L3: Write the fee when an import applies

**Files:**
- Modify: `apps/api/src/services/import-service.ts` (anchor: `export const applyImport`, ~L587; anchor: the `orderRepo.upsertOrder(tx, {` call inside it, ~L672-686)
- Test:   `apps/api/src/routes/imports.test.ts` (anchor: `describe.skipIf(!url)('import routes (seeded database)'`, ~L91; anchor: the lifeline `describe` block, ~L288)

**Interfaces:**
- Consumes: `computePlatformFee` (L2, full signature above); `channelRepo.listChannels(exec, { orgId })` returning rows that now carry `feeRateBps` (L1).
- Produces: applied orders carry `platformFee` + `feeSource` per D1/D3; no signature change.

**Gotcha:** `orderRepo.upsertOrder` needs NO code change. It inserts `values` (a `NewOrder`), so the new fields flow through, and its `onConflictDoUpdate` set-list must NOT gain the fee columns: a re-import refreshes the row but keeps the first import's fee and definitely keeps a later manual override. Add that column pair to the comment's NOT-updated list (`packages/db/src/repositories/order-repo.ts:29-35`) as the only repo edit.
Read the channel row once before the loop: `const channels = await channelRepo.listChannels(tx, { orgId });` then `const channel = channels.find((entry) => entry.id === channelId);` and throw the existing `not_found` shape if missing (parity with `channelKindOf` in `apps/api/src/services/order-service.ts:210-221`).

**Steps:**
- [x] Step 1: In `applyImport`, after `const channelId = asChannelId(batch.channelId);`, resolve the channel row and keep it.
- [x] Step 2: Inside the per-order loop, directly before `orderRepo.upsertOrder`, compute
      ```ts
      const fee = computePlatformFee({
        channelKind: channel.kind,
        feeRateBps: channel.feeRateBps,
        grandTotal: order.grandTotal,
      });
      ```
      and pass `platformFee: fee.fee, feeSource: fee.source` into the upsert values.
- [x] Step 3: Update the `upsertOrder` doc comment's NOT-updated list to include the fee columns with the D3 rationale.
- [x] Step 4: Extend the lifeline describe in `imports.test.ts`: after the first `uploadAndApply`, assert through SQL (the wire mapping of the fee columns lands in Task L4, so `GET /orders/:id` cannot see them yet): `select platform_fee, fee_source from orders where ...` for the applied order must return `platform_fee = Math.round((grandTotal * 1400) / 10000)` and `fee_source = 'channel_default'`, where `grandTotal` is the fixture order total the test already knows. The wire-level assertions (owner sees the fields, sales does not) belong to Task L4 Step 6 and must not be duplicated here.
- [x] Step 5: Verify - Run: `DATABASE_URL="$PG_URL" bun test apps/api/src/routes/imports.test.ts && bun run --filter @stockhub/api typecheck && bun run --filter @stockhub/api lint` - Expected: all tests pass (the file's existing count plus the new assertions), 0 fail; typecheck and lint exit 0.
- [x] Step 6: Commit - `git commit -m "Charge the channel default fee on imported orders"`

#### Task L4: Manual fee override on one order

**Files:**
- Modify: `packages/db/src/repositories/order-repo.ts` (anchor: `export const setOrderStatus`, ~L162)
- Modify: `apps/api/src/services/order-service.ts` (anchor: `export const getOrder`, ~L243; anchor: `export const cancelOrder`, ~L524 - insert the new function before it)
- Modify: `apps/api/src/routes/orders.ts` (anchor: `export const ordersRouter`, ~L39)
- Modify: `apps/api/src/schemas/orders.ts` (anchor: `export const orderParam`, ~L38)
- Modify: `apps/api/src/types/contract.ts` (anchor: `export interface Order`, ~L189-208)
- Test:   `apps/api/src/routes/orders.test.ts` (anchor: its owner/sales describe block)

**Interfaces:**
- Consumes: `FEE_SOURCES` / `FeeSource` (L1), `ok()` + `requirePermission` + `validate` route pattern, `setOrderStatus` repo shape (`for('update')`, `not_found` throw).
- Produces (consumed by L7 client + L9 screen):
  ```ts
  // route
  PATCH /api/v1/orders/:id/fee   body: { fee: number }   permission: cost:write   -> ok(c, Order)
  // service
  export const setOrderFee: (ctx: ServiceContext, orderId: OrderId, fee: Satang) => Promise<Order>;
  // repo
  export const setOrderFee: (exec: DbExecutor, params: { orgId: OrgId; orderId: OrderId; fee: Satang; source: FeeSource }) => Promise<void>;
  // contract Order gains, after margin:
  /** cost field */
  platformFee?: MoneyOnWire;
  /** cost field */
  feeSource?: FeeSource;
  ```

**Gotcha:** three details bite at once. (1) The wire mapping must happen inside `toWireOrder` (`apps/api/src/services/order-service.ts:109-129`), NOT in `getOrder`'s cost extras: `toWireOrder` receives the `DbOrder` row and spreads only `cost.cogs` / `cost.margin`, and `getOrder`, `createPosOrder` and the list mapper `toWireOrders` all build responses through it, so one edit there carries `platformFee` / `feeSource` onto every order response including the `POST /orders` reply. Add
      ```ts
      platformFee: order.platformFee,
      feeSource: order.feeSource,
      ```
      to the object literal next to `grandTotal`. The new fields flow through `redactMiddleware` automatically because Task L4 puts their keys in `COST_KEYS` - the route test asserts the sales-side absence to prove it. (2) `FeeSource` reaches `contract.ts` as `import type { FeeSource } from '@stockhub/core'` - the types file already re-exports core types this way. (3) The zod body must bound the value: `z.object({ fee: z.number().int().nonnegative().max(1_000_000_000) })` (satang; the cap is a sanity rail at 10 million baht, not a business rule).

**Steps:**
- [x] Step 1: Repo `setOrderFee` mirroring `setOrderStatus`: select the row `for('update')`, throw `not_found` when missing, then
      ```ts
      await exec.update(orders).set({ platformFee: params.fee, feeSource: params.source, updatedAt: new Date() }).where(and(eq(orders.orgId, params.orgId), eq(orders.id, params.orderId)));
      ```
- [x] Step 2: Schema `setOrderFeeBody` in `apps/api/src/schemas/orders.ts`.
- [x] Step 3: Service `setOrderFee`: transaction -> repo with `source: 'manual'` -> return `getOrder(ctx, orderId)` so the caller sees fresh `cogs` / `margin` / `platformFee` together.
- [x] Step 4: Route
      ```ts
      .patch(
        '/:id/fee',
        requirePermission('cost:write'),
        validate('param', orderParam),
        validate('json', setOrderFeeBody),
        async (c) => ok(c, await setOrderFee(serviceContext(c), asOrderId(c.req.valid('param').id), satang(c.req.valid('json').fee))),
      )
      ```
      matching the mount style of the existing `.post` handlers.
- [x] Step 5: Contract edit (Order fields above) in the same commit as its COST_KEYS registration: add `'fee'`, `'platformFee'` and `'feeSource'` to the `COST_KEYS` set literal in `packages/core/src/rbac.ts` (anchor: the `'grossProfit'` line inside `COST_KEYS`, ~L110). Both new fields carry the marker, so the reverse audit stays green in this commit and Task L6 only reuses keys that are already registered. Expected: contract audit 3 tests pass in this task's verify.
- [x] Step 6: Tests in `orders.test.ts`: manager PATCHes `{ fee: 3500 }` on a bill -> 200, response carries `platformFee 3500`, `feeSource 'manual'`; sales PATCHes -> 403 (no `cost:write`); owner GET -> `platformFee` present; sales GET -> neither `platformFee` nor `feeSource` in the JSON.
- [x] Step 7: Verify - Run: `DATABASE_URL="$PG_URL" bun test apps/api/src/routes/orders.test.ts apps/api/src/contract-audit.test.ts && bun run --filter @stockhub/api typecheck && bun run --filter @stockhub/api lint && bun run --filter @stockhub/core typecheck` - Expected: new tests pass, contract audit 3 pass, 0 fail anywhere; all typechecks exit 0.
- [x] Step 8: Commit - `git commit -m "Add manual platform fee override"`
  > Orchestrator note: ticked by the reviewing orchestrator - commit `5fb3296` verified on the branch (the executor missed the box, the commit itself landed and was verified: subject, staged files incl. the plan, tree clean).

#### Task L5: Profit read model in the movement repo

**Files:**
- Modify: `packages/db/src/repositories/movement-repo.ts` (anchor: `export const listCogsByDayChannel`, ~L502 - add the new function after it)
- Test:   `packages/db/src/repositories/movement-repo.integration.test.ts` (new, mirrors `listing-repo.integration.test.ts` header, `Rollback` helper and `skipIf(!db)` gate)

**Interfaces:**
- Consumes: `orders`, `orderLines` unused here, `stockMovements` table objects; `OrderLedgerSums` inputs come back as raw numbers.
- Produces (consumed by L6):
  ```ts
  export interface ProfitLedgerRow {
    orderId: string; externalOrderId: string; status: OrderStatus; orderedAt: Date;
    channelId: string; channelName: string; channelKind: ChannelKind;
    grandTotal: number; platformFee: number; feeSource: FeeSource;
    unitsSold: number; soldCost: number; restoredUnits: number; restoredCost: number;
  }
  export const listProfitOrders: (exec: DbExecutor, params: { orgId: OrgId; from: Date; to: Date; channelId?: ChannelId }) => Promise<ProfitLedgerRow[]>;
  ```
  (Named `ProfitLedgerRow`, not `ProfitOrderRow` - that name belongs to the wire type Task L6 defines in `contract.ts`, and the service between them imports both worlds.)
  ```
  Row semantics: only orders with at least one `sale_out` movement; window on `orders.orderedAt` inclusive-exclusive `[from, to)`; sums come from `stock_movements` grouped per order, with the signs the ledger actually writes: `unitsSold = sum(-qty_delta)` over `sale_out` (outbound is negative), `soldCost = sum(cost_total)` over `sale_out`, and `restoredUnits = sum(qty_delta)` / `restoredCost = sum(cost_total)` over reasons `('return_in', 'cancel_restore')` - restores are INBOUND, so their `qty_delta` is positive (`packages/core/src/services/stock/movement.ts:104,120`, contract "Positive inbound, negative outbound" at `apps/api/src/types/contract.ts:157`); `to` is exclusive because L6 passes `from midnight of to+1 day`, mirroring `getCogsReport`.

**Gotcha:** copied verbatim from the `listCogsByDayChannel` header comment - inside subqueries, bare `order_id` correlates to the inner table, so every outer reference stays table-qualified. Sum columns of `bigint` come back as strings; map with `Number()` like `listCogsByDayChannel` does. Cap the query with `limit 10_000` as a runaway guard; L6's schema bounds the window to 366 days so the cap is unreachable in practice.

**Steps:**
- [x] Step 1: Implement with one select: `orders o` inner-join a `sale_out` aggregate subquery, left-join a restore aggregate subquery, inner-join `channels` for name/kind, `where(and(eq(orders.orgId, ...), gte(orders.orderedAt, from), lt(orders.orderedAt, to), channelId ? eq(...) : undefined))`, `orderBy(desc(orders.orderedAt), asc(orders.id))`, `limit(10_000)`.
      ```ts
      const saleAgg = db.$with('') // not needed - use raw sql subqueries per the listCogsByDayChannel style
      ```
      Concretely, follow the file's existing raw-`sql` style:
      ```ts
      soldCost: sql<number>`coalesce((select sum(m2.cost_total) from stock_movements m2
        where m2.order_id = ${orders.id} and m2.reason = 'sale_out'), 0)::int`.as('sold_cost'),
      ```
      and the same shape for `unitsSold` (`sum(-m2.qty_delta)` over `sale_out`) and for `restoredUnits` (`sum(m2.qty_delta)`, NO minus sign - restores are inbound) and `restoredCost` (`sum(m2.cost_total)`) over `reason in ('return_in','cancel_restore')`. Simpler and index-friendlier alternative that stays within the file's conventions: explicit `sql` subselects per column group as above - do NOT introduce a `with()` CTE style the file has never used.
      > Deviation: the sale_out filter required by the row semantics ("only orders with at
      > least one `sale_out` movement") is implemented as an `exists (select 1 from
      > stock_movements m1 where m1.order_id = ${orders.id} and m1.reason = 'sale_out')`
      > condition inside the `and(...)` where list, keeping the raw-`sql` style; the step's
      > where sketch did not list it.
- [x] Step 2: Integration test, all inside `inRollback`: insert one order (fixed uuid, `channelId` shopeeMain, `grandTotal` 50500, `platformFee` 7070, `feeSource` 'channel_default', `status` 'delivered', `orderedAt` now) plus one `sale_out` movement (qtyDelta -3, costTotal 24000) and one `return_in` movement (qtyDelta +1, costTotal 8000 - restores are inbound, positive) for the same order; assert the row comes back with `unitsSold 3`, `soldCost 24000`, `restoredUnits 1`, `restoredCost 8000`; a second order without movements must NOT appear; the `channelId` filter must drop the row when set to `pos`.
- [x] Step 3: Verify - Run: `DATABASE_URL="$PG_URL" bun test packages/db/src/repositories/movement-repo.integration.test.ts && bun run --filter @stockhub/db typecheck` - Expected: 3 pass, 0 fail; typecheck exit 0; the rollback left the seed untouched (`bun test packages/db/src/guards.integration.test.ts` still passes).
- [x] Step 4: Commit - `git commit -m "Add per-order profit read model"`

#### Task L6: Serve GET /reports/profit

**Files:**
- Modify: `apps/api/src/schemas/reports.ts` (anchor: `cogsReportQuery`, append after it)
- Modify: `apps/api/src/services/report-service.ts` (anchor: `export const getCogsReport`, add `getProfitReport` after it)
- Modify: `apps/api/src/routes/reports.ts` (anchor: the `.get('/cogs', ...)` chain entry, append one `.get('/profit', ...)`)
- Modify: `apps/api/src/types/contract.ts` (anchor: `export interface CogsReport`, add the three types after it)
- Modify: `apps/api/src/leak-scan.test.ts` (anchor: `LEAK_SCAN_DB_PATHS`, ~L28, append one path)
- Modify: `apps/api/README.md` (anchor: the `GET /api/v1/reports/cogs` table row, ~L132, append one row)
- Test:   `apps/api/src/routes/reports.test.ts` (anchor: the test named `setup: ledger fixtures land in one transaction`, ~L121, whose fixture transaction the new assertions extend)

**Interfaces:**
- Consumes: `listProfitOrders` (L5, full signature above), `orderProfit` + `computePlatformFee` types (L2), `FeeSource` (L1), the three keys already in `COST_KEYS` since L4 (`fee`, `platformFee`, `feeSource`; `profit`, `cogs`, `margin` were already there).
- Produces (wire, consumed by L7):
  ```ts
  export interface ProfitOrderRow {
    id: string; externalOrderId: string; channelId: string; channelName: string; channelKind: ChannelKind;
    status: OrderStatus; orderedAt: string;
    unitsSold: number; unitsReturned: number; revenue: MoneyOnWire;
    /** cost field */
    fee?: MoneyOnWire;
    /** cost field */
    cogs?: MoneyOnWire;
    /** cost field */
    profit?: MoneyOnWire;
    /** cost field */
    feeSource?: FeeSource;
  }
  export interface ChannelProfitRow {
    channelId: string; channelName: string; channelKind: ChannelKind;
    orders: number; unitsSold: number; unitsReturned: number; revenue: MoneyOnWire;
    /** cost field */
    fee?: MoneyOnWire;
    /** cost field */
    cogs?: MoneyOnWire;
    /** cost field */
    profit?: MoneyOnWire;
  }
  export interface ProfitReport {
    from: string; to: string; channelId?: string; ordersInWindow: number;
    rows: ProfitOrderRow[];   // newest first, capped at `limit`
    channelRows: ChannelProfitRow[];   // biggest profit first
    totals: { orders: number; unitsSold: number; unitsReturned: number; revenue: MoneyOnWire; /** cost field */ fee?: MoneyOnWire; /** cost field */ cogs?: MoneyOnWire; /** cost field */ profit?: MoneyOnWire };
  }
  export const getProfitReport: (ctx: ServiceContext, query: { from: string; to: string; channelId?: string; limit: number }) => Promise<ProfitReport>;
  ```
  `channelRows` and `totals` cover the WHOLE window (never just the returned page); `ordersInWindow` is the untruncated count.

**Gotcha:** the profit endpoint response is built per-role by `ok()`'s redaction like every other route, but the route ALSO 403s for roles without `cost:read`, so stripping never fires in practice - exactly the COGS report's situation, and for the same reason ("a stripped profit report would be an empty table").

**Steps:**
- [x] Step 1: Schema. `cogsReportQuery` is a `ZodEffects` (`z.object(...).refine(...)`, `apps/api/src/schemas/reports.ts:26-33`) and zod 3 has no `.extend` on it, so restate the object:
      ```ts
      export const profitQuery = z
        .object({
          from: z.string().date(),
          to: z.string().date(),
          channelId: idString.optional(),
          limit: z.coerce.number().int().min(1).max(1000).default(200),
        })
        .refine((value) => value.from <= value.to, { message: '`from` must not be after `to`' })
        .refine(
          (value) => (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 366,
          { message: 'window is capped at 366 days' },
        );
      export type ProfitQuery = z.infer<typeof profitQuery>;
      ```
      (`idString` is already imported in this file.)
- [x] Step 2: Service `getProfitReport`: build `fromAt` / `toAt` exactly like `getCogsReport` (Bangkok midnights, `to` exclusive after +1 day); call `listProfitOrders`; map each row through `orderProfit({ grandTotal: satang(row.grandTotal), platformFee: satang(row.platformFee), unitsSold: row.unitsSold, soldCost: row.soldCost, restoredUnits: row.restoredUnits, restoredCost: row.restoredCost })`; assemble `rows` (first `limit`), then `channelRows` by grouping the FULL mapped set with a `Map<channelId, ChannelProfitRow>` summed field by field, sorted by profit desc; `totals` by summing the full set; `ordersInWindow` = full length. Keep every integer a `Satang`/number - no floats anywhere.
- [x] Step 3: Route entry copying the COGS entry's shape with `validate('query', profitQuery)`.
      > Deviation: the route file's header comment said "COGS is the one endpoint where
      > the whole response is cost data"; with a second such endpoint it was reworded to
      > cover both, keeping the comment truthful.
- [x] Step 4: Contract types with every marker exactly as in Interfaces; import `FeeSource` type from core.
- [x] Step 5: `leak-scan.test.ts`: append `'/api/v1/reports/profit?from=2025-01-01&to=2025-01-31'` to `LEAK_SCAN_DB_PATHS`. Honest note: the scan only walks `LEAK_SCAN_ROLES` (`sales`, `stock_staff`, `apps/api/src/leak-scan.test.ts:45`) and this route answers both with 403, so the appended path scans no body and documents intent only - the real redaction coverage for this feature is Step 6's route tests plus the Task L4 orders assertions.
- [x] Step 6: `reports.test.ts`: inside the existing fixture machinery (the setup transaction that already creates a sale for the water-can), add one shopee-shaped order + `sale_out` movement (reuse the fixture's insertion helpers; if the fixtures live in the setup test's transaction, extend it in place), then a new `describe` that asserts as `owner`: 200; the order row's `profit === revenue - fee - cogs` identity; the fixture order appears with `feeSource` from its stored fee; `channelRows` contains its channel with summed profit; `totals` equals the sum of channelRows; as `sales` and as `stock_staff`: 403 with the standard error envelope code `forbidden`.
      > Deviation: the fixture order (ORD-5) needed its own INSERT statement - Postgres
      > multi-row VALUES lists require equal-length tuples and the pre-fee shared insert
      > has 8 columns. ORD-5's `ordered_at` / movement `occurred_at` sit 2 days back so
      > the today-only dashboard buckets are untouched; this left every pre-existing
      > assertion in the file valid unchanged (verified: 19/19 in reports.test.ts).
- [x] Step 7: README row: `| `GET /api/v1/reports/profit?from=&to=` | `cost:read` | query: `from`, `to` dates, `channelId` optional, `limit` 1-1000 default 200 | `ProfitReport`, 403 without `cost:read` |`.
- [x] Step 8: Verify - Run: `DATABASE_URL="$PG_URL" bun test apps/api/src/routes/reports.test.ts apps/api/src/leak-scan.test.ts apps/api/src/contract-audit.test.ts && bun run --filter @stockhub/api typecheck && bun run --filter @stockhub/api lint` - Expected: all pass, 0 fail; typecheck and lint exit 0.
- [x] Step 9: Commit - `git commit -m "Serve the profit report from the ledger"`

#### Task L7: Web client layer for profit + fee

**Files:**
- Modify: `apps/web/src/lib/api-types.ts` (anchor: `export interface CogsReportResponse`, ~L553; anchor: `export interface Order`, ~L399)
- Modify: `apps/web/src/lib/api-client.ts` (anchor: the `reports` section, ~L209-228; anchor: `cancelOrder`, ~L188)
- Modify: `apps/web/src/lib/mock-data.ts` (anchor: `cogsReport: (query: CogsQuery = {})` inside `mockApi`, ~L1409)
- Test:   `apps/web/src/lib/api-profit.test.ts` (new, mirrors `apps/web/src/lib/api-pricing.test.ts`)

**Interfaces:**
- Consumes: the wire contract from L4 (`Order.platformFee` / `Order.feeSource`) and L6 (`ProfitReport`, `setOrderFee` route).
- Produces (consumed by L8, L9):
  ```ts
  export type FeeSource = 'none' | 'manual' | 'channel_default' | 'exported';
  export interface ProfitOrderRow { ... }     // mirror of L6, field for field
  export interface ChannelProfitRow { ... }
  export interface ProfitReportResponse { ... }
  export interface ProfitQuery { from: string; to: string; channelId?: string; limit?: number }
  api.getProfitReport(query: ProfitQuery = {}): Promise<ProfitReportResponse>
  api.setOrderFee(orderId: string, fee: number): Promise<Order>   // PATCH /orders/:id/fee
  ```
  Flat method names next to their siblings, exactly like `getCogsReport` and `cancelOrder` - the client has no grouping objects.

**Gotcha:** the order mirror in `apps/web/src/lib/api-types.ts` is named `Order` (~L399), so `setOrderFee` returns `Promise<Order>` - keep that name. `mock-data.ts` is the only file with fake data and it must keep running the same role stripping as the real backend (`mock-data.ts:1-12` header). Build `mockApi.profitReport` from the existing MOCK order rows so the demo toggles roles correctly, and make `setOrderFee` mutate the mock order in place like the other mock mutations do.

**Steps:**
- [x] Step 1: Mirror the three report types + `FeeSource` + the two Order fields (`platformFee`, `feeSource`) into `api-types.ts`, keeping the file's `MoneyAmount` naming and the `cost-gated` comment style used by `Order.cogs`.
- [x] Step 2: `api-client.ts`: add `getProfitReport` right after `getCogsReport` (demo/real pair, same shape) and `setOrderFee` next to `cancelOrder` (demo echo + real PATCH).
  > Deviation: the plan's `getProfitReport(query: ProfitQuery = {})` default value cannot typecheck - `ProfitQuery.from`/`to` are required strings (as the same Produces block states), so TS2739 rejects `= {}`. Dropped the default on both the client method and `mockApi.profitReport`; the signature is otherwise identical.
- [x] Step 3: `mock-data.ts`: `mockApi.profitReport(query)` (a flat sibling of `mockApi.cogsReport`; there is no `reports` grouping in `mock-data.ts`) filters a small in-file `MOCK_PROFIT_ORDERS` array (4 orders across shopee + pos, one fully returned) by the window and channel, computes `channelRows` + `totals` with the same identity `profit = revenue - fee - cogs`, caps rows at `limit ?? 200`; `setOrderFee` sets `platformFee` and `feeSource: 'manual'` on the mock order and returns it.
- [x] Step 4: `api-profit.test.ts` (pure): totals equal the summed rows; the fully returned order contributes all zeros; the channel filter drops other channels; `setOrderFee` echoes `feeSource 'manual'`.
- [x] Step 5: Verify - Run: `bun test apps/web/src/lib/api-profit.test.ts && bun run --filter @stockhub/web typecheck && bun run --filter @stockhub/web lint` - Expected: 4 pass, 0 fail; typecheck and lint exit 0.
  > Ran 2026-09-19: `4 pass, 0 fail, 25 expect() calls`; `@stockhub/web typecheck: Exited with code 0`; `@stockhub/web lint: Exited with code 0`.
- [ ] Step 6: Commit - `git commit -m "Add web profit report and fee client"`

#### Task L8: /reports/profit screen + sidebar entry

**Files:**
- Create: `apps/web/src/app/reports/profit/page.tsx`
- Modify: `apps/web/src/components/sidebar.tsx` (anchor: the `/reports/cogs` NAV_ITEMS entry, ~L58-64)

**Interfaces:**
- Consumes: `api.getProfitReport` (L7), `CostValue`, `useRole().hasPermission('cost:read')`, the page skeleton of `apps/web/src/app/reports/cogs/page.tsx` (date inputs, `StatCard`, `Table*` primitives, loading / empty / error states).

**Gotcha:** the existing `/reports/cogs` entry carries `match: ['/reports']`, so once a second item lives under `/reports` both entries would highlight together. Narrow the cogs entry to `match: ['/reports/cogs']` in the same commit and give the new entry `match: ['/reports/profit']`.

**Steps:**
- [ ] Step 1: Page structure, mirroring the COGS page: gate on `hasPermission('cost:read')` and render the locked note instead of fetching when absent; from/to date inputs defaulting to the last 30 days (`defaultRange()` pattern); optional channel `Select` fed by `api.getChannels()`; per-channel section as `StatCard`s or a compact table (orders, revenue, fee, cogs, profit, all money through `<CostValue>`); per-order table (date, external id, channel badge, status badge, units, revenue, fee, cogs, profit) with `<CostValue>` on fee/cogs/profit; a totals footer row; loading `TableSkeleton`, `EmptyState` ("ยังไม่มีออเดอร์ที่ตัดสต็อกในช่วงนี้"), `ErrorState` with retry; a small footnote "ค่าธรรมเนียมเป็นค่าที่ตั้งไว้ต่อช่องทาง แก้ได้ที่หน้าออเดอร์" explaining fee provenance.
- [ ] Step 2: Sidebar: insert after the cogs entry
      ```ts
      {
        href: '/reports/profit',
        label: 'รายงานกำไร',
        icon: TrendingUp,   // add to the lucide-react import list at the top
        permission: 'cost:read',
        match: ['/reports/profit'],
      },
      ```
      and change the cogs entry's `match` to `['/reports/cogs']`.
- [ ] Step 3: Verify - Run: `bun run --filter @stockhub/web typecheck && bun run --filter @stockhub/web lint && grep -c "MOCK" apps/web/src/app/reports/profit/page.tsx` - Expected: typecheck and lint exit 0; grep prints 0 (the page never imports mock data directly).
- [ ] Step 4: Commit - `git commit -m "Add profit report screen"`

#### Task L9: Fee override control on the order detail page

**Files:**
- Modify: `apps/web/src/app/orders/[id]/page.tsx` (anchor: the totals block with `<CostValue value={order.cogs} />`, ~L173; anchor: the action buttons block with the cancel `Button`, ~L319)

**Interfaces:**
- Consumes: `api.setOrderFee` (L7), `order.platformFee` / `order.feeSource` (L7 mirror), `useRole().hasPermission('cost:write')`, the existing dialog + `useMutation` patterns on the page (`cancel`, `doReturn` at ~L253-254).

**Steps:**
- [ ] Step 1: In the cost area of the page (next to the existing COGS `CostValue`), render for roles WITH `cost:write` a "ค่าธรรมเนียมแพลตฟอร์ม" row: the fee via `<CostValue>`, the source as Thai text (`'none'` -> "ไม่มี", `'manual'` -> "ตั้งเอง", `'channel_default'` -> "ตามช่องทางขาย", `'exported'` -> "จากแพลตฟอร์ม"), and a small "แก้ไข" `Button` opening a `Dialog` with one baht `Input` (convert with the file's existing money helpers: display `baht(order.platformFee)`, submit `Math.round(Number(value) * 100)`), plus roles WITHOUT `cost:write` see nothing new (the existing `cost:read` stripping already hides the numbers).
- [ ] Step 2: Submit through `useMutation((fee: number) => api.setOrderFee(orderId, fee))`, on success refresh the order query (the hook pattern the cancel flow already uses) and close the dialog; keep loading / error states on the dialog submit button like the cancel dialog.
- [ ] Step 3: Verify - Run: `bun run --filter @stockhub/web typecheck && bun run --filter @stockhub/web lint` - Expected: both exit 0.
- [ ] Step 4: Verify - Manual: start the API only (`cd apps/api && bun run dev`), then as manager `curl -X PATCH localhost:8787/api/v1/orders/<billId>/fee -H 'content-type: application/json' -H 'x-demo-role: manager' -d '{"fee":3500}'` - Expected: HTTP 200 and `"feeSource":"manual"` in the JSON; repeat with `-H 'x-demo-role: sales'` - Expected: HTTP 403. (`<billId>`: create a bill first via `POST /api/v1/orders` or reuse one from the seeded data - a pending seed order is fine, fees are status-independent.)
- [ ] Step 5: Commit - `git commit -m "Add fee override to the order page"`

## Failure handling summary

- **Migration drifts on the shared database (another checkout migrated last)** - Detect: Task L1's `drizzle-kit generate --name noop` prints changes, or `ls packages/db/drizzle/*.sql` shows numbers beyond the plan's expectation. Respond: STOP, run the re-base checklist, agree with the user which database this run owns before any further `db:*` command.
- **Baseline red count returns after L0** - Detect: `bun run test` prints failures other than 0 with `--max-concurrency=1`. Respond: if the four known files fail again, capture `git rev-parse HEAD` and the failing names, STOP, report - do not widen the serialization hack (for example do not add retries).

## End-to-end verification

Run on the merged branch with the shared database freshly seeded, `wrangler dev --port 8788` for the API and `next dev --port 3100` for the web (`bun run dev:api -- --port 8788` equivalent or `cd apps/api && bunx wrangler dev --port 8788`).

- [ ] Run: reseed first - `DATABASE_URL="$PG_URL" bun run db:migrate && DATABASE_URL="$PG_URL" bun run db:seed` - Expected: "Seed complete".
- [ ] Run: import + apply the Lazada fixture as manager -
      `curl -s -X POST localhost:8788/api/v1/imports -H 'x-demo-role: manager' -F "file=@packages/adapters/fixtures/lazada-orders.sample.csv"` then `curl -s -X POST localhost:8788/api/v1/imports/<id>/apply -H 'x-demo-role: manager'` - Expected: apply returns 200 with `movementsCreated` equal to the matched sold-line count the preview's `willDeduct` group showed, and a `cogs` value present.
- [ ] Run: open one POS bill as sales -
      `curl -s -X POST localhost:8788/api/v1/orders -H 'x-demo-role: sales' -H 'content-type: application/json' -d '{"channelKind":"pos","lines":[{"variantId":"'"$(psql "$PG_URL" -Atc "select id from variants where sku='HAT-01'")"'","quantity":2,"unitPrice":50000}]}'` - Expected: 201; the response's `platformFee` is `0` and `feeSource` is `'none'`.
- [ ] Run: override the fee on that bill as manager -
      `curl -s -X PATCH localhost:8788/api/v1/orders/<billOrderId>/fee -H 'x-demo-role: manager' -H 'content-type: application/json' -d '{"fee":3500}'` - Expected: 200, `"feeSource":"manual"`, `"platformFee":3500`.
- [ ] Run: the report over the fixture's own window, role owner - the imported Lazada orders carry the FILE's order dates, and `applyImport` stores `orderedAt` from the file (`apps/api/src/services/import-service.ts:676`). `orderedAt` comes from `createTime` (`packages/adapters/src/lazada/columns.ts:20`), which spans 2026-02-14 10:05 to 2026-02-15 21:14; 02-16 appears only in `updateTime`. The window below is [Feb 14 00:00, Feb 17 00:00) Bangkok time and therefore covers every row - do not "tighten" `to` to 02-15, it would silently drop the 21:14 order:
      `curl -s "localhost:8788/api/v1/reports/profit?from=2026-02-14&to=2026-02-16" -H 'x-demo-role: owner'` - Expected: HTTP 200; the applied Lazada orders appear with `feeSource` `channel_default` and `fee` equal to the round-half-up of `grandTotal * 1300 / 10000` (integer math, identical to `computePlatformFee`; do not express this as a float multiply) per row; every row satisfies `profit === revenue - fee - cogs`; `totals.profit` equals the sum of `channelRows[].profit`.
- [ ] Run: the report over today, role owner - `TODAY=$(TZ=Asia/Bangkok date +%F); curl -s "localhost:8788/api/v1/reports/profit?from=$TODAY&to=$TODAY" -H 'x-demo-role: owner'` - Expected: the POS bill row appears with `fee 3500`, `feeSource manual`, and the same profit identity; `ordersInWindow` counts exactly the orders with sold units today (the bill only, until other journeys sell).
- [ ] Run: the report, restricted roles - the same curl with `-H 'x-demo-role: sales'` and with `-H 'x-demo-role: stock_staff'` - Expected: both HTTP 403 with `{"error":{"code":"forbidden"...}}`; `GET /orders/<billOrderId>` as sales contains neither `platformFee` nor `feeSource`.
- [ ] Manual: in the browser as owner open `http://localhost:3100/reports/profit` - Expected: per-channel cards + per-order table render with Thai labels, the POS bill shows the manual fee of 35.00 baht, switching the range to last month shows the empty state.
- [ ] Manual: switch the role switcher to พนักงานขาย - Expected: "รายงานกำไร" disappears from the sidebar (the nav item is permission-gated) and the order detail page shows no fee row.
- [ ] 👤 Human: view `/reports/profit` and the order detail fee dialog as เจ้าของกิจการ and judge the layout against the rest of the app - Expected: the two new money columns read clearly and the dialog matches the app's existing dialogs - Proxy: the owner-payload curl above plus `bun run --filter @stockhub/web typecheck && bun run --filter @stockhub/web lint` prove everything except the visual judgement.
- [ ] Run: full gate - `bun run typecheck && bun run lint && bun run test` - Expected: typecheck 6 packages exit 0, lint green, `268 + (new tests) pass, 0 fail`.

## Review log

- 2026-09-19, round 1 (`/skill:scrutinize` via a fresh subagent, no planning context): verdict FIX FIRST with 1 blocker and 5 majors. All applied: the fixture-date window vs report window (E2E split into a fixture-window step and a today step), the fee wire mapping moved into `toWireOrder`, the return-sign inversion in the L5 fixture (positive `qty_delta` plus explicit formulas), the `.extend` on a refined zod schema (object restated), the flat client naming (`getProfitReport` / `setOrderFee` / `getChannels`), and the migration count (three at base, L1 generates 0003). Five nits applied: leak-scan wording, two CHECK constraints, six marketplace channels, three citation line fixes, and the D3 re-import wrinkle. Round 2 reviewer dispatched after these fixes.
- 2026-09-19, round 2 (fresh subagent, `/skill:scrutinize`): verdict SHIP - all six round-1 fixes verified against the tree, independent pass found no blocker and no major. Four nits applied: `mockApi.profitReport` flat sibling name, the fixture date span corrected to createTime 2026-02-14..15 with a do-not-tighten warning, the db-side row type renamed `ProfitLedgerRow` to avoid colliding with the wire type, and the E2E fee expectation restated as integer round-half-up. Plan ready to execute.
