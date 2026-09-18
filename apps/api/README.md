# @stockhub/api

StockHub HTTP API.
Bun + [Hono](https://hono.dev) running on Cloudflare Workers.
Base path `/api/v1`, plus an unauthenticated `/health`.

This package is a template skeleton.
Routes answer with either a trivially correct response or clearly marked `// MOCK:` data, so the web demo renders end to end before the database exists.
Real business logic lives in `src/services/*` and currently throws `NotImplementedError`, which the API returns as HTTP 501.

## Run locally

```bash
bun install                      # from the repo root, once
cp apps/api/.dev.vars.example apps/api/.dev.vars
bun run dev:api                  # wrangler dev on http://localhost:8787
```

```bash
curl http://localhost:8787/health
curl -H 'x-demo-role: owner'  -H 'x-demo-org: org_demo' http://localhost:8787/api/v1/inventory
curl -H 'x-demo-role: sales'  -H 'x-demo-org: org_demo' http://localhost:8787/api/v1/inventory
```

Compare the two inventory calls.
The `sales` payload has no `avgUnitCost` and no `stockValue` keys at all.
That is the demo headline, and it is enforced on the server, not in the UI.

## Tests, types, lint

```bash
cd apps/api
bun test        # route tests against the mock data, including cost stripping
bun run build   # tsc --noEmit
bun run lint    # biome check .
```

## Demo auth

| Header | Values | Meaning |
| --- | --- | --- |
| `x-demo-role` | `owner`, `manager`, `stock_staff`, `sales` | acting job position |
| `x-demo-org` | any id | tenant, defaults to `org_demo` |
| `x-demo-user` | any id | optional, for the audit trail |

`src/middleware/auth.ts` turns those headers into a typed `AuthContext`.
Real auth replaces the body of that one middleware and nothing else.
The middleware fails closed: with `DEMO_MODE` not set to `true` every request is rejected with 403.

## Field visibility

Every JSON response under `/api/v1` is redacted by `src/middleware/redact.ts` using `FIELD_POLICIES` in `packages/core/src/rbac.ts`.
When adding a field that contains cost, add its key to `COST_KEYS`, and for a tier price field add it to `PRICE_TIER_KEYS`.
Mark the field `/** cost field */` or `/** tier field */` in `src/types/`, and `src/contract-audit.test.ts` fails otherwise.
`ok()` remains the required helper for every successful response.

## Bindings

| Binding | Type | Needed for | Create it |
| --- | --- | --- | --- |
| `IMPORTS_BUCKET` | R2 bucket | storing the original uploaded order export files | `bunx wrangler r2 bucket create stockhub-imports` |
| `HYPERDRIVE` | Hyperdrive | pooled Postgres from the edge | `bunx wrangler hyperdrive create stockhub-db --connection-string="postgresql://..."` |
| `DATABASE_URL` | secret / dev var | local Postgres when Hyperdrive is not bound | `apps/api/.dev.vars` |

Every id in `wrangler.toml` is a fake placeholder such as `<your-r2-bucket>`.
Replace them with your own before a deploy.
The `[[hyperdrive]]` block is commented out so `wrangler dev` starts without any Cloudflare resource.

## Layout

```
src/index.ts           app wiring only (CORS, logger, request id, error handler, mounts)
src/env.ts             typed bindings + zod validated accessor
src/middleware/        auth, permission guard, per-request db, cors, request id, error mapping
src/lib/response.ts    ok() / paginated() - the single choke point for cost hiding
src/lib/validate.ts    zod validation that returns the documented error envelope
src/lib/cursor.ts      opaque keyset cursors
src/lib/mock-data.ts   MOCK fixtures, delete when the db lands
src/routes/            one file per resource, matching the HTTP contract
src/schemas/           zod request schemas
src/services/          orchestration of core + db + adapters (where you continue)
src/adapters/          R2 StoragePort, order source adapter registry
src/types/contract.ts  the JSON contract shared with apps/web
```

## Add a route

1. Add a zod schema in `src/schemas/<resource>.ts` for any query, param or body.
2. Add the response type to `src/types/contract.ts`, marking cost fields with `?` and a `/** cost field */` comment.
3. Create `src/routes/<resource>.ts`:

```ts
export const thingRouter = new Hono<AppEnv>().get(
  '/',
  requirePermission('stock:read'),
  validate('query', listThingQuery),
  async (c) => ok(c, await listThings(serviceContext(c), c.req.valid('query'))),
);
```

4. Export it from `src/routes/index.ts` and mount it on `v1` in `src/index.ts`.
5. Use `ok()` or `paginated()`, never `c.json()`, so cost hiding keeps working.
6. Add a test to `src/index.test.ts`.

## Contract

New endpoints this wave (response shapes in `src/types/contract-catalog.ts`, mirrored in `apps/web/src/lib/api-types-catalog.ts`).

| Endpoint | Permission | Request | Response |
| --- | --- | --- | --- |
| `GET /api/v1/catalog/search?q=&limit=` | `stock:read` | query: `q` 1-120 chars, `limit` 1-50 (default 10) | `CatalogSearchRow[]` |
| `POST /api/v1/listings` | `import:run` | body: `SaveListingInput` | `SaveListingResult` |
| `GET /api/v1/listings?channelId=` | `stock:read` | query: `channelId` optional | `ListingView[]` |

## Error contract

Every failure answers with `{ "error": { "code", "message", "details"? } }`.

| code | HTTP |
| --- | --- |
| `validation_error` | 400 |
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `not_found` | 404 |
| `insufficient_stock` | 409 |
| `unmatched_sku` | 422 |
| `not_implemented` | 501 |

Throw a `StockHubError` subclass from `@stockhub/core` and the mapping happens in `src/middleware/error.ts`.

## Deploy

```bash
cd apps/api
bunx wrangler r2 bucket create stockhub-imports
bunx wrangler hyperdrive create stockhub-db --connection-string="postgresql://..."
# paste the ids into wrangler.toml, uncomment the [[hyperdrive]] block
bunx wrangler secret put DATABASE_URL --env production   # only if you skip Hyperdrive
bun run deploy -- --env production
bun run cf-typegen                                       # regenerate binding types
```

Before a production deploy, set `DEMO_MODE=false` and implement real auth.
Otherwise anyone can pick their own role with a request header.
