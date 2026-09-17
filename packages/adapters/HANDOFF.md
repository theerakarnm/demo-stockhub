# packages/adapters - HANDOFF

Owner of this package during the template build: the adapters agent.
Status: **detection is finished and tested. Parsing is a deliberate skeleton.**

## Verification (run before you trust anything below)

```
bun test packages/adapters     # 38 pass, 14 skip, 0 fail
bun run --filter @stockhub/adapters typecheck
bun run --filter @stockhub/adapters lint
```

All three were run green in an isolated sandbox with the same `tsconfig.base.json` and `biome.json`.
Nothing was installed into the repo, as agreed.

## Files created

```
packages/adapters/
  package.json                    @stockhub/adapters, deps below
  tsconfig.json                   extends ../../tsconfig.base.json
  README.md                       add a marketplace in 4 steps / file adapter -> API adapter
  HANDOFF.md                      this file
  fixtures/
    README.md                     PDPA warning: never commit a real customer export
    shopee-orders.sample.csv      5 rows / 4 orders, Thai headers, UTF-8 BOM, "฿1,890.00"
    lazada-orders.sample.csv      5 rows / 4 orders, camelCase headers, one row per unit
    tiktok-orders.sample.csv      4 rows / 3 orders, description row under the header
  src/
    index.ts                      public surface
    registry.ts                   adapters, getAdapter, detectAll, detectAdapter, DETECTION_THRESHOLD
    registry.test.ts              real tests, must stay green
    test-helpers.ts               fixture loader (not exported from index.ts)
    shared/
      read-tabular.ts             CSV+XLSX -> { headers, rows }   IMPLEMENTED
      read-tabular.test.ts        real tests
      header-match.ts             normalise, alias resolve, signature score   IMPLEMENTED
      parse-values.ts             Thai numbers, money -> Satang, dates + tz   IMPLEMENTED
      parse-values.test.ts        real tests
      group-rows.ts               flat rows -> order groups   IMPLEMENTED
      index.ts
    shopee/  lazada/  tiktok/
      columns.ts                  header alias map + HeaderSignature   (edit me when a platform changes)
      status-map.ts               platform status -> core OrderStatus
      adapter.ts                  detect() IMPLEMENTED, parse() SKELETON
      adapter.test.ts             detect tests real, parse tests test.skip with full assertions
```

## Dependencies added

| Package | Version | Why |
| --- | --- | --- |
| `@stockhub/core` | `workspace:*` | the `OrderSourceAdapter` port, money, errors |
| `papaparse` | `^5.4.1` | CSV parsing (quoted cells with commas, preview mode for header-only reads) |
| `xlsx` | `^0.18.5` | XLSX/XLS parsing |
| `@types/papaparse` | `^5.3.15` (dev) | types |
| `typescript` | `^5.7.2` (dev) | typecheck script |

## Key decisions

1. **`xlsx` (SheetJS) instead of `exceljs`.** SheetJS is synchronous, reads a `Uint8Array` directly, and has no Node stream dependency, so the same adapter code runs in the Cloudflare Workers runtime that hosts `apps/api`. `exceljs` does not. Full rationale in the header of `src/shared/read-tabular.ts`.
   **Open item:** npm only serves SheetJS 0.18.5, which has two known advisories fixed in CDN-only releases. Pin the CDN tarball or move to exceljs before go-live. The library sits behind `readTabular`, so the swap touches one file.
2. **`detect()` is real, `parse()` is not.** Detection is cheap (header row only) and it is what makes the demo feel alive: drop a file, the UI names the platform and says why. Parsing is where the real per-platform judgement calls live, so it is left explicit rather than guessed.
3. **Scoring instead of hard-coded header equality.** `confidence = 0.55 * required + 0.45 * unique`, threshold `0.6`. A Shopee and a TikTok export share every generic header (`Order ID`, `Order Status`, `Seller SKU`, `Quantity`), so shape alone is capped at 0.55 and a fingerprint header is mandatory. `src/registry.test.ts` fails if a new alias makes two platforms ambiguous.
4. **Money never touches a float.** Every money cell goes through `parseMoney` -> `fromBaht` -> `Satang`.
5. **Dates are wall clock, not UTC.** TH exports print Bangkok local time with no offset. `parseDate` interprets them in `ParseContext.timeZone` (default `Asia/Bangkok`) using `Intl`. Ignoring this shifts every evening order to the wrong business day and corrupts FIFO ordering.
6. **Issues, not exceptions.** A bad row produces a `ParseIssue` and the import continues. The only `throw` in the parse path is the `NotImplementedError` marking the unfinished block.
7. **Column aliases live in one file per platform.** `columns.ts` is the single edit point when a marketplace renames a header. Every value written from memory is tagged `// VERIFY:`.
8. **Lazada exports one row per unit.** Not per line. The Lazada fixture encodes this (order `...002` is two rows of `SICKLE-01` = qty 2) and the skipped test asserts it. Getting this wrong under-deducts stock by the quantity factor.

## What the next developer must implement

In order of value:

1. **`parse()` TODO BLOCK 1 + BLOCK 2 in all three `adapter.ts` files.** Steps 1 to 12 are written out inline. Delete the `throw new NotImplementedError(...)` at the end when done. Then delete `.skip` from the parse tests one at a time - they already carry the expected values.
   - Shopee: read `cancellationStatus` as well as `orderStatus`.
   - Lazada: collapse per-unit rows by SKU before building lines; prefer `paidPrice` over `unitPrice`.
   - TikTok: read `orderSubStatus`; guard against Excel having destroyed 19 digit order ids.
2. **Verify every `// VERIFY:` marker** in `*/columns.ts` and `*/status-map.ts` against one real export per platform, then delete the marker. A wrong status mapping moves stock at the wrong time, which is the most expensive bug class in this system.
3. **Decide the TIS-620 policy.** `looksLikeMojibake()` only warns today. Either add a real `windows-874` decode path (works in Bun/Node, not in Workers) or keep telling the user to re-save as UTF-8.
4. **Add the XLSX fixtures.** The three fixtures are CSV. Real Shopee and TikTok exports are usually `.xlsx`; `readTabular` handles it, but there is no test proving it end to end.
5. **Wire the "try a sample file" button** in `apps/web` to `fixtures/*.sample.csv`.
6. **When API access lands**, add `src/<platform>/api-adapter.ts` implementing the same interface and change one line in `src/registry.ts`. See README.md.

## Notes for the lead agent

- Nothing outside `packages/adapters/` was created or modified.
- No installer was run in the repo. `bun install` at the root will resolve `papaparse`, `xlsx` and `@types/papaparse`.
- `src/test-helpers.ts` is test-only and is intentionally not re-exported from `src/index.ts`.
- The package exports `./shared` as well as `.`, so `apps/api` can reuse `readTabular` for a manual CSV upload without going through an adapter.
