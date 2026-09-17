# AGENTS.md

A guide for AI agents and developers working in this repository.
Read this file to the end before editing the first line of code.

---

## 1. Project Context

StockHub is a system that consolidates stock from multiple sales channels into a single central warehouse.
It is currently a **boilerplate**: the structure, contracts, and screens are complete, but the business logic is still stubs.

Markers used throughout the repository:

| Marker | Meaning |
| --- | --- |
| `TODO(template)` | A gap intentionally left for implementation, always accompanied by an algorithm description |
| `NotImplementedError` | A function with a complete signature but no logic yet |
| `// MOCK:` | Fake data added so screens can render, must be removed once wired to the real thing |
| `// VERIFY:` | A guessed value, must be checked against a real export file before trusting it |

When you pick up a task, grep for these markers first to see which stubs the requested work touches.

---

## 2. Iron Rules

1. **`packages/core` must not import frameworks**
   Never import Next.js, Hono, Drizzle, React, or the Cloudflare runtime into `packages/core`.
   core must be testable with plain `bun test`.
   If you feel you need such an import, that logic belongs in `apps/api/src/services/` instead.

2. **Adapters only convert data**
   Files in `packages/adapters` must not touch the database, call HTTP, or decide anything about stock.
   Their only job is to take a file and return `NormalizedOrder[]`.
   An adapter must not throw on a bad row: push it into `issues` and continue, because one broken row must not bring down a 2,000-row file.

3. **Money is always an integer in satang**
   Use the `Satang` type from `@stockhub/core`, never use floats for money in any case.
   Convert to decimal only when displaying or exporting.

4. **Cost hiding is enforced at the API**
   Every response must go through `ok()` in `apps/api/src/lib/response.ts`, which calls `stripCost()` automatically.
   Hiding it in React is only cosmetic, not security.
   When adding a field that contains cost, also add that key to `COST_KEYS` in `packages/core/src/rbac.ts`.

5. **FIFO must run in a single transaction**
   Read lots with `SELECT ... FOR UPDATE`, compute with pure functions, then write back, all inside one transaction.
   Never compute FIFO outside a transaction, no exceptions.

6. **Re-importing a file must not deduct stock twice**
   The unique constraint `(channelId, externalOrderId)` on the `orders` table is the lifeline of this rule.
   If you change the import logic, write a test that imports the same file twice and asserts stock stays the same.

7. **Returns restore the original cost**
   `restoreFifo` takes the `LotConsumption[]` of the original sale, not a quantity repriced at today's cost.

---

## 3. Folder Ownership

| Folder | Responsibility | Must not contain |
| --- | --- | --- |
| `packages/core` | Pure domain, business rules, shared types | frameworks, I/O, SQL, fetch |
| `packages/adapters` | Reading the export files of each platform | DB, HTTP, stock deduction |
| `packages/db` | schema, migration, repository, seed | business rules, HTTP |
| `apps/api` | HTTP routing, auth, orchestration | business rules that belong in core |
| `apps/web` | UI | cost calculations, hand-rolled permission checks |

If you are about to write logic and are not sure where it goes, ask: "Can it be tested without a DB and HTTP?"
If yes, it goes in `packages/core`.

---

## 4. Conventions

### TypeScript

- Strict mode is on with every flag, do not turn it off in sub-packages; if an override is truly needed, add a comment explaining why
- Always use `import type` for types, because `verbatimModuleSyntax` is enabled
- Do not use `any`; if unavoidable, use `unknown` and narrow
- Do not use `!` (non-null assertion), handle the undefined case for real, because `noUncheckedIndexedAccess` is enabled

### Naming

- Files are `kebab-case.ts`
- Types and interfaces are `PascalCase`, functions and variables are `camelCase`
- Constants that are arrays of a union are `SCREAMING_SNAKE_CASE` and are always declared next to their type
- Database tables are plural `snake_case`, Drizzle variables are `camelCase`

### Enums

- The single source of truth is `packages/core/src/domain/enums.ts`
- `packages/db/src/schema/enums.ts` is a shadow of that file
- Always fix core first, then db, then run `bun run db:generate`

### Errors

- Throw only `StockHubError` or a subclass, so the error middleware can map it to an HTTP status
- Every error must have a stable `code`, because the frontend uses `code`, not messages

### Comments

- Write comments in English, on-screen text in Thai
- A comment must explain **why**, not **what**
- Every stub must have a comment describing the intended algorithm steps

### Markdown

- Write one sentence per line to keep diffs readable
- Do not use the em dash character, use a plain hyphen instead

---

## 5. How to Add Things

### Adding a new endpoint

1. Add a zod schema in `apps/api/src/schemas/`
2. Add a handler in the relevant router in `apps/api/src/routes/`
3. Return values only through `ok()` or `paginated()`
4. If it needs permissions, wrap it with `requirePermission()`
5. Add matching types and functions in `apps/web/src/lib/api-types.ts` and `api-client.ts`
6. Update the contract table in `apps/api/README.md`

### Adding a new screen

1. Create a route under `apps/web/src/app/`
2. Fetch data only through `api-client.ts`, no direct `fetch`
3. Always include all three states: loading, empty, and error
4. Wrap every cost figure with `<CostValue>`
5. Add a link in the sidebar in `apps/web/src/app/layout.tsx`

### Adding a new table

1. Write the schema in a `packages/db/src/schema/` file grouped by domain
2. Always include `orgId` and an index on `orgId`
3. Money uses bigint in satang, time uses timestamp with timezone
4. Add all `relations()`
5. Run `bun run db:generate` and commit the resulting SQL file, never hand-edit SQL files
6. Add seed data if the table is needed for the demo

### Adding a new platform

Follow the four steps in `packages/adapters/README.md`.
If you need to change files outside `packages/adapters` beyond adding a value to `CHANNEL_KINDS`, the design is wrong: stop and reconsider.

---

## 6. Commands

| Command | When to use |
| --- | --- |
| `bun install` | after cloning or after adding a dependency |
| `bun run dev` | development, runs every app together |
| `bun run typecheck` | before every commit |
| `bun run lint` | before every commit |
| `bun test` | before every commit |
| `bun run db:generate` | after changing the schema |
| `bun run db:seed` | when you want to reset demo data |
| `bun run docker:up` / `docker:down` | start and stop PostgreSQL |

---

## 7. Testing

- Pure logic is tested in `packages/core` with `bun test`, no DB needed
- `packages/core/src/services/costing/fifo.test.ts` is the FIFO specification written as tests
  Every test is `.skip`ped, unskip them one by one while building the engine
- Adapters are tested with fixtures in `packages/adapters/fixtures/`
- When fixing a bug, first write a test that reproduces it, then fix it

---

## 8. Security and Customer Data

- **Never commit real customer export files**, use made-up fixtures only
  Real files go in `data/local/`, which is already gitignored
- Never put real secrets in any file in the repository
  Use placeholders in `.env.example`, `.dev.vars.example`, and `wrangler.toml`
  Set real values through `wrangler secret put`
- Never log buyer data such as names, addresses, or phone numbers to the console or error tracking
- Original files in R2 are kept permanently as evidence
  Never delete them automatically

---

## 9. Commit Rules

- Commit subjects are at most about 50 characters, in imperative form, e.g. `Add FIFO consume engine`
- Explain the reason in the body if the change is not self-explanatory
- Never add an AI agent name as co-author
- Never hand-edit `CHANGELOG.md` or files marked as auto-generated
- One commit does one thing, reformatting a whole file gets its own commit

---

## 10. Definition of Done

A piece of work counts as done when every item below holds.

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes
- [ ] If the schema changed, the migration file is committed
- [ ] If an endpoint was added, `api-client.ts` and `api-types.ts` are updated
- [ ] If a cost field was added, it is in `COST_KEYS` and tested with the `sales` role to confirm it is stripped
- [ ] No leftover `// MOCK:` in code declared as wired to the real thing
- [ ] README or AGENTS.md updated if the rules changed
