# apps/api handoff

Bun + Hono API on Cloudflare Workers.
Verified before handoff: `tsc --noEmit` clean, `biome check .` clean, `bun test` 16 pass / 0 fail.

## Files created

Config

- `package.json` - scripts `dev`, `deploy`, `build`, `typecheck`, `lint`, `test`, `cf-typegen`.
- `tsconfig.json` - extends `tsconfig.base.json`, types `@cloudflare/workers-types` + `@types/bun`.
- `wrangler.toml` - name `stockhub-api`, `nodejs_compat`, R2 `IMPORTS_BUCKET`, commented `HYPERDRIVE`, `[vars]`, `[env.production]`.
- `.dev.vars.example`, `.gitignore` (`.dev.vars`, `.wrangler/`).
- `README.md` - run, bindings, add a route, error table, deploy.

Source

- `src/index.ts` - app wiring only: request id, logger, CORS, error handler, router mounts, `export default { fetch }`.
- `src/env.ts` - `Env` bindings interface + zod validated `appConfig()`, `DEFAULT_DEMO_ROLE`, `DEFAULT_DEMO_ORG`.
- `src/types/app.ts` - `AuthContext`, `AppVariables`, `AppEnv` (typed Hono generics).
- `src/types/contract.ts` - the whole JSON contract shared with `apps/web`, cost fields marked.
- `src/middleware/` - `auth.ts`, `require-permission.ts`, `db.ts`, `error.ts`, `cors.ts`, `request-id.ts`.
- `src/lib/` - `response.ts` (cost hiding choke point), `validate.ts`, `cursor.ts`, `mock-data.ts`, `db.ts` (db seam).
- `src/routes/` - `health`, `me`, `channels`, `dashboard`, `inventory`, `imports`, `orders`, `movements`, `reports`, plus `index.ts` barrel.
- `src/schemas/` - `common`, `inventory`, `movements`, `imports`, `orders`, `reports`.
- `src/services/` - `context.ts`, `import-service.ts`, `inventory-service.ts`, `order-service.ts`.
- `src/adapters/` - `r2-storage.ts` (real R2 StoragePort), `order-source-registry.ts` (adapter detection seam).
- `src/index.test.ts` - 16 route tests, including cost stripping per role.

## Key decisions

1. `wrangler.toml`, not `wrangler.jsonc`.
   The file is mostly documentation for the next developer, and TOML keeps a comment next to the value it explains.
   Every Cloudflare R2 and Hyperdrive doc example is published in TOML, so copy and paste stays literal.

2. One choke point for cost hiding: `src/lib/response.ts`.
   Handlers always build the full payload including cost fields and never look at the role.
   `ok()` and `paginated()` call `can(role, 'cost:read')` once and run `stripCost()` when the answer is no.
   A developer who forgets the rule still ships a safe payload.

3. Access control and field visibility are separate.
   `requirePermission()` blocks a whole endpoint (403), used for `/reports/cogs` which is entirely cost data.
   Field stripping handles the mixed payloads, so `sales` can read an order but not its COGS.

4. `stockValue` is stripped by an API side extension, marked `TODO(core)`.
   `COST_KEYS` in `packages/core/src/rbac.ts` does not contain `stockValue`, but the contract puts it on `StockRow` and on the dashboard summary, and it is pure purchase cost.
   `src/lib/response.ts` therefore strips `API_COST_KEYS` (`stockValue`, `stockValueTotal`, `grossMargin`) after core's `stripCost()`.
   ACTION FOR THE CORE OWNER: add those keys to `COST_KEYS` in core, then delete `API_COST_KEYS` and its walk.
   Two tests in `src/index.test.ts` fail if this protection is removed while core is unchanged.

5. Validation errors follow the documented envelope.
   `@hono/zod-validator` answers with its own `{ success: false, error }` body, which breaks the contract.
   `src/lib/validate.ts` wraps it with a hook that rethrows the `ZodError`, so `middleware/error.ts` formats it as `{ error: { code: 'validation_error', ... } }` with 400.
   Use `validate(target, schema)` in routes, never `zValidator` directly.

6. The database handle is per request and lazy.
   A Worker isolate cannot reuse a socket across requests, so `middleware/db.ts` creates the accessor per request and closes it in a `finally`.
   It is lazy, so `/health` and every MOCK route answers with no database running and the demo works on a laptop with nothing installed.
   Hyperdrive absorbs the cost of opening on a deployed Worker.

7. `@stockhub/db` and `@stockhub/adapters` are reached through two small seams, not imported everywhere.
   Those packages are written in parallel, so `src/lib/db.ts` exposes a structural `DbClient` (transaction + close) and `src/adapters/order-source-registry.ts` exposes `adapters()` / `detectAdapter()`.
   Each file carries the exact one-line import that replaces the stub.
   This is why the package typechecks today even though both dependencies are still empty.

8. Demo auth fails closed.
   With `DEMO_MODE` not exactly `true` the auth middleware rejects the request, so a production deploy cannot be impersonated with a header.
   `[env.production]` in `wrangler.toml` already sets `DEMO_MODE = "false"`.

9. Cursor pagination, not offset.
   Inventory and movement lists are append heavy, so an offset page shifts under the user.
   `src/lib/cursor.ts` encodes `{ at, id }` as base64url and documents the keyset `WHERE (created_at, id) < ($at, $id)` query.

10. Money stays in satang integers on the wire.
    Formatting happens in the UI with `formatMoney()` from core.

## Dependencies added

Runtime

- `hono` ^4.6.14
- `@hono/zod-validator` ^0.4.2
- `zod` ^3.24.1
- `@stockhub/core` workspace:*
- `@stockhub/db` workspace:* (declared, reached only through `src/lib/db.ts`)
- `@stockhub/adapters` workspace:* (declared, reached only through `src/adapters/order-source-registry.ts`)

Dev

- `wrangler` ^3.95.0
- `@cloudflare/workers-types` ^4.20241224.0
- `@types/bun` ^1.1.14
- `typescript` ^5.7.2

No installer was run inside the repo.
Verification happened in a throwaway workspace at `/tmp/stockhub-api-verify`, which holds a copy of `packages/core` and `apps/api`.

## What the next developer must implement

Priority order.

1. `src/lib/db.ts` - replace `openDb()` with `createDb()` from `@stockhub/db` and point `DbClient` at the real `Db` type.
2. `src/adapters/order-source-registry.ts` - return the adapter list from `@stockhub/adapters` in `adapters()`.
3. `src/services/inventory-service.ts` - `listInventory`, `getVariantDetail`, `listMovements`, `adjustStock`.
   Each function already documents the SQL and the core calls it needs, including `averageUnitCost()` and `bundleAvailability()` for bundle rows.
4. `src/services/import-service.ts` - `uploadImport`, `getImportPreview`, `saveManualMatch`, `applyImport`, `listImports`.
   `applyImport` is the important one: one transaction, upsert orders, `expandBundles`, lock lots `FOR UPDATE`, `planMovements`, `consumeFifo` with `onShortage: 'shortfall'` for marketplace sales, write movements and lot consumptions.
5. `src/services/order-service.ts` - `createPosOrder` (FIFO with `onShortage: 'error'`, 409 on oversell), `listOrders`, `getOrder`, `cancelOrder`, `returnOrder` (both restore the ORIGINAL consumption with `restoreFifo`).
6. Replace every `// MOCK:` block in `src/routes/` with the service call written in the comment above it, then delete `src/lib/mock-data.ts` and the mock based tests.
   Grep: `rg "// MOCK:" apps/api/src` and `rg "NotImplementedError" apps/api/src`.
7. Add `GET /api/v1/imports/:id/file` as a proxy download and delete `signedUrl` from the R2 adapter, or wire real S3 presigning.
   The reasoning for both options is in `src/adapters/r2-storage.ts`.
8. Replace the body of `src/middleware/auth.ts` with real session or JWT verification, set `DEMO_MODE=false`, and keep producing the same `AuthContext`.

Blocked on core (stubs that still throw): `consumeFifo`, `restoreFifo`, `valueOfLots`, `averageUnitCost`, `planMovements`, `expandBundles`, `bundleAvailability`, `matchSku`.
Nothing in this package can move stock until those land.
