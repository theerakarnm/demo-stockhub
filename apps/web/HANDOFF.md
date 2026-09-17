# apps/web - handoff

Next.js 15 App Router frontend for StockHub (`@stockhub/web`). Demo-ready UI shell on top of the
real HTTP contract. No business logic lives here by design.

Nothing was installed, built or run: `bun install`, `next build` and `next dev` were all out of
scope for this task. **Run `bun install` at the repo root, then
`bun run --filter @stockhub/web typecheck` and `... lint` before the first demo.**

## Files created

### Config
- `package.json` - scripts: dev, build, start, typecheck, lint (`biome check .`)
- `tsconfig.json` - extends `../../tsconfig.base.json`, adds jsx preserve, next plugin, DOM libs,
  `paths: { "@/*": ["./src/*"] }`. Keeps `verbatimModuleSyntax` and `noUncheckedIndexedAccess`;
  only turns off `declaration` / `declarationMap` (Next owns type emit).
- `next.config.ts` - `transpilePackages: ['@stockhub/core']` because core ships raw TypeScript
- `postcss.config.mjs` - Tailwind v4 through `@tailwindcss/postcss`
- `.env.example`, `next-env.d.ts`, `README.md`

### Library (`src/lib`)
| file | role |
| --- | --- |
| `api-types.ts` | the wire contract: one type per endpoint, money as integer satang |
| `api-client.ts` | the only module that calls the API, one function per endpoint |
| `api-error.ts` | typed `ApiError` + code -> HTTP status map (own module to avoid a cycle) |
| `use-api.ts` | `useApi` / `useMutation` hooks |
| `demo-identity.ts` | the demo "session" behind the `x-demo-role` / `x-demo-org` headers |
| `config.ts` | every `NEXT_PUBLIC_*` read, in one place |
| `labels.ts` | Thai labels + tones for every core enum |
| `format.ts` | money, dates, quantities, bytes |
| `cn.ts` | clsx + tailwind-merge |
| `mock-data.ts` | `// MOCK:` fixtures, the single file to delete later |

### Components
- `ui/` - hand-rolled kit: Badge, Button (+`buttonClass`), Card/CardHeader/CardBody/CardFooter,
  Drawer, Dialog, EmptyState, ErrorState, Input/SearchInput, PageHeader, Select, Skeleton
  (+TableSkeleton, CardSkeleton), StatCard, Table primitives. Barrel at `ui/index.ts`.
- `role-provider.tsx`, `role-switcher.tsx`, `cost-value.tsx` (`CostValue` / `CostGate` /
  `CostLockedNote`), `domain-badges.tsx`, `sidebar.tsx`, `topbar.tsx`
- `inventory/`, `imports/`, `orders/` - page-specific sub-components

### Screens
`/` dashboard, `/inventory`, `/inventory/[variantId]`, `/imports`, `/imports/new`,
`/imports/[id]`, `/orders`, `/orders/new`, `/movements`, `/reports/cogs`, `/settings/channels`,
plus `error.tsx`, `loading.tsx`, `not-found.tsx`.

## Dependencies added

| package | version | why |
| --- | --- | --- |
| `next` | ^15.1.3 | App Router |
| `react`, `react-dom` | ^19.0.0 | required by Next 15 |
| `@stockhub/core` | workspace:* | enums, rbac, money, error codes |
| `lucide-react` | ^0.468.0 | icons |
| `clsx` | ^2.1.1 | conditional classes |
| `tailwind-merge` | ^2.6.0 | conflict-free class merging |
| dev: `tailwindcss`, `@tailwindcss/postcss` | ^4.0.0 | styling |
| dev: `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | - | types |

No component library, no data-fetching library, no form library.

## Key decisions

1. **Tailwind v4, no `tailwind.config.ts`.** The theme lives in `src/app/globals.css` under
   `@theme`. Content files are discovered automatically. If you prefer v3, add a config and swap
   the postcss plugin; no component change is needed.
2. **One API module.** Components never call `fetch`. Adding an endpoint means touching
   `api-types.ts` + `api-client.ts` + `mock-data.ts` and nothing else.
3. **Demo mode is a switch inside the client**, not a second code path in the screens. Every
   method reads `demo(mock, live)`; the live branch is already the production code.
4. **Cost gating is API-first.** `stripCost()` removes the fields server side, so cost-bearing
   fields are optional in `api-types.ts`. `<CostValue>` is cosmetic and says so in its own doc
   comment. The mock fixtures run the same `stripCost()` so the demo does not lie.
5. **Client-side rendering for data screens.** Switching role must re-render instantly, so pages
   are client components and pass `role` into the `useApi` dependency list.
6. **`useParams` instead of the `params` prop**, because Next 15 hands `params` to server
   components as a Promise and our pages are client components.
7. **Route group `(dashboard)`** holds the "/" screen so the dashboard file sits next to its
   siblings without owning the root path name.
8. Thai UI copy with English code comments and identifiers everywhere, per the house rule.

## What the next developer must implement

1. **Point it at the real API.** Set `NEXT_PUBLIC_DEMO_MODE=false` and fix any drift between
   `src/lib/api-types.ts` and the API response shapes. They must change together.
2. **Real cursor pagination.** Three screens (`/inventory`, `/orders`, `/movements`) currently
   raise the `limit` instead of passing `nextCursor`, because `useApi` replaces data instead of
   appending. Search for `TODO(template)` near `PAGE_SIZE`.
3. **Per-channel stock.** `channelId` is sent to `GET /api/v1/inventory` but the mock ignores it.
   Decide what "stock of a channel" means (listing-level reservation?) and implement it.
4. **Bundle availability.** `/inventory/[variantId]` computes `min(floor(onHand / qtyPerBundle))`
   locally. Replace it with `bundleAvailability()` from `@stockhub/core` once that stub is done.
5. **Import polling.** `POST /api/v1/imports` is treated as synchronous. When the API starts
   parsing in the background, poll `GET /api/v1/imports/:id` while the status is
   `uploaded`/`parsing` and drive the stepper from it.
6. **Unmatched-SKU search.** The resolution control only offers the suggestions the API returned.
   Add a full product search picker (marked with `TODO(template)` in `unmatched-panel.tsx`).
7. **Cache invalidation.** After `applyImport` or `createOrder` nothing refreshes the inventory
   and movement lists; there is no shared cache. Add one (or adopt a data layer) when the API
   lands.
8. **Channel management.** `/settings/channels` is read-only; the "แก้ไข" button is disabled and
   labelled. Needs `PATCH /api/v1/channels/:id` plus the `channel:write` permission check.
9. **Stock adjustments and goods receipt.** There is no UI yet for `purchase_in` / `adjust_*`
   movements. Both are needed before the app is usable outside the demo.
10. **Report export.** `/reports/cogs` has no CSV export.
11. **Accessibility and polish pass.** Rows are keyboard reachable and every control has a label,
    but the app has not been screen-reader tested and there is no mobile sidebar (the nav is
    hidden below `lg`).

## Verification status

- Cross-checked by hand: every `@/...` and `@stockhub/core` import resolves to a real export,
  every `<Link href>` resolves to a real route, no unused imports, no em dash, no file writes
  outside `apps/web/`.
- NOT verified: `tsc --noEmit`, `biome check .`, `next build`, and any runtime behaviour. Run
  them first thing after `bun install`.
