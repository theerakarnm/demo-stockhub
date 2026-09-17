# @stockhub/web

Next.js 15 (App Router) frontend for StockHub - one central stock pool shared by 6 online shops,
a physical counter and wholesale.

The app is written so the 10 minute sales demo runs with no backend at all: every API call is
answered by `src/lib/mock-data.ts` while `NEXT_PUBLIC_DEMO_MODE` is on.

## Run it

```bash
# from the repo root, once
bun install
cp apps/web/.env.example apps/web/.env.local

# then
bun run dev:web        # http://localhost:3000
```

Scripts (run from `apps/web` or with `bun run --filter @stockhub/web <script>`):

| script      | what it does                  |
| ----------- | ----------------------------- |
| `dev`       | Next dev server on port 3000  |
| `build`     | production build              |
| `start`     | serve the production build    |
| `typecheck` | `tsc --noEmit`                |
| `lint`      | `biome check .`               |

Environment (`.env.local`):

| variable                  | meaning                                               |
| ------------------------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`     | base URL of `@stockhub/api`, no trailing slash        |
| `NEXT_PUBLIC_DEMO_MODE`   | `true` = mock data, `false` = call the real API       |
| `NEXT_PUBLIC_DEMO_ORG_ID` | value sent as the `x-demo-org` header                 |
| `NEXT_PUBLIC_DEMO_ORG_NAME` | org name shown in the top bar                       |

The first `next build` downloads IBM Plex Sans Thai through `next/font/google`, so it needs
network access. For an offline build, swap that import in `src/app/layout.tsx` for
`next/font/local` and a font file under `public/`.

## Demo script (the order the screens were designed for)

1. `/` - ภาพรวม. One pool, every channel, and the cost-gated stock value.
2. `/imports/new` - upload a marketplace order export, review the preview, resolve unmatched
   SKUs, confirm, stock is deducted.
3. `/inventory/[variantId]` - FIFO lots and the movement trail behind one product.
4. Role switcher in the top bar - switch to พนักงานขาย and watch every cost number disappear.

## Layout of the code

```
src/
  app/
    layout.tsx              sidebar + top bar + RoleProvider, Thai font
    (dashboard)/page.tsx    "/" dashboard
    inventory/              stock list + variant detail
    imports/                batch list, upload flow, preview
    orders/                 order list + POS / wholesale bill
    movements/              stock movement history
    reports/cogs/           FIFO cost report (cost:read only)
    settings/channels/      the 8 sales channels
  components/
    ui/                     hand-rolled kit: Card, Table, Badge, Button, Input, Select,
                            Drawer/Dialog, EmptyState, ErrorState, Skeleton, PageHeader, StatCard
    role-provider.tsx       role context, persisted to localStorage
    role-switcher.tsx       top bar switcher
    cost-value.tsx          <CostValue> / <CostGate> / <CostLockedNote>
    domain-badges.tsx       enum -> chip
    sidebar.tsx, topbar.tsx
  lib/
    api-client.ts           the only module that talks to the API
    api-types.ts            the wire contract (must match apps/api exactly)
    api-error.ts            typed ApiError + code -> HTTP status map
    use-api.ts              useApi / useMutation hooks
    labels.ts               Thai labels for every core enum
    format.ts               money, dates, quantities
    mock-data.ts            MOCK: every fixture, one file
    config.ts, cn.ts, demo-identity.ts
```

## How to add a page

1. Create `src/app/<segment>/page.tsx`. Start it with `'use client';` if it uses hooks.
2. Fetch with the shared hook, and always include `role` in the dependency list:

   ```tsx
   const { role } = useRole();
   const { data, error, loading, reload } = useApi(() => api.getInventory({ q }), [q, role]);
   ```

3. Render the four states: loading (`<TableSkeleton />`), error (`<ErrorState />`),
   empty (`<EmptyState />`) and content.
4. Add the route to `NAV_ITEMS` in `src/components/sidebar.tsx`. Give it a `permission` if the
   whole page should disappear for some job positions.
5. New endpoint? Add the types to `src/lib/api-types.ts`, the function to `src/lib/api-client.ts`
   and a fixture to `src/lib/mock-data.ts`. Never call `fetch` from a component.

## How the role gate works

- `RoleProvider` keeps the selected job position, mirrors it to `localStorage` and pushes it into
  `src/lib/demo-identity.ts`.
- `api-client.ts` sends it as the `x-demo-role` header (with `x-demo-org`) on every request.
- The API middleware turns those headers into an `AuthContext` and, in ONE shared response helper,
  runs `stripCost()` from `@stockhub/core` when the role lacks `cost:read`.
- So a role without `cost:read` never receives cost numbers - the JSON simply has no such field.
- `<CostValue>` in the UI is **cosmetic**: it renders `••••` with a lock so the screen explains
  why a number is missing. It is not a security control.
- Permission answers come from `can()` / `permissionsOf()` in `@stockhub/core`. The web app never
  writes its own rule table.

Role matrix (from `packages/core/src/rbac.ts`):

| role          | sees cost | can import | can open a bill |
| ------------- | --------- | ---------- | --------------- |
| `owner`       | yes       | yes        | yes             |
| `manager`     | yes       | yes        | yes             |
| `stock_staff` | no        | yes        | no              |
| `sales`       | no        | no         | yes             |

## Swapping mock data for the real API

1. Start the API (`bun run dev:api`) and confirm `GET /health` answers.
2. Set `NEXT_PUBLIC_DEMO_MODE=false` in `.env.local`. Every call now goes over HTTP; nothing else
   changes, because the mock functions mirror the real response shapes.
3. Fix any mismatch in `src/lib/api-types.ts` **and** in the API in the same commit.
4. When the backend is complete: delete `src/lib/mock-data.ts`, delete the `demo()` wrapper and
   the `mockApi` import in `src/lib/api-client.ts`, and drop the `buildSampleImportFile()` button
   from the upload screen. Grep for `MOCK:` to be sure nothing is left.
