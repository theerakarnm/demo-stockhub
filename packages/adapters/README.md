# @stockhub/adapters

Marketplace order-source adapters.
This package turns an exported order file from Shopee, Lazada or TikTok Shop into `NormalizedOrder[]`.

It is the architectural showcase of StockHub: **read files today, call APIs tomorrow, without touching the core.**

## Where it sits

```
apps/api  ->  @stockhub/adapters  ->  OrderSourceAdapter (port, in @stockhub/core)
                    |
                    +-- shopee/   file adapter   (today)
                    +-- lazada/   file adapter   (today)
                    +-- tiktok/   file adapter   (today)
                    +-- shopee/api-adapter.ts    (tomorrow, same interface)
```

Rules every adapter obeys (they come from `packages/core/src/ports/order-source.ts`):

1. No database, no R2, no HTTP. Bytes in, `NormalizedOrder[]` out.
2. It never decides stock. It only describes what the platform said happened.
3. It never throws on a bad row. One broken line must not kill a 2,000 line import. Push a `ParseIssue` and carry on.

## Public API

```ts
import { detectAdapter, detectAll, getAdapter, adapters } from '@stockhub/adapters';

const guess = await detectAdapter(file);   // { kind: 'shopee', confidence: 1, reason } | null
const all = await detectAll(file);         // every adapter scored, best first (good for the UI)
const adapter = getAdapter('shopee');
const result = await adapter.parse(file, { timeZone: 'Asia/Bangkok' });
```

## Detection

`detect()` is fully implemented and reads **only the header row**, so the registry can afford to run every adapter on every upload.

Each platform declares a `HeaderSignature` in its `columns.ts`:

- `required` - the generic columns the export always has (Order ID, Status, SKU, Quantity),
- `unique` - the fingerprint headers no other platform uses (`ชื่อตัวเลือก` for Shopee, `orderItemId` for Lazada, `Order Substatus` for TikTok).

```
confidence = 0.55 * (required matched / required total)
           + 0.45 * (unique matched / unique total)
```

`DETECTION_THRESHOLD` is **0.6**, which means shape alone (max 0.55) is never enough - the file must also carry at least one fingerprint header.
See the comment on the constant in `src/registry.ts` before changing it.

## Add a new marketplace in 4 steps

Say the shop starts selling on Line Shopping.

1. **Add the kind.** In `packages/core/src/domain/enums.ts` add `'line'` to `CHANNEL_KINDS` and to `IMPORTABLE_CHANNEL_KINDS`, then mirror it in `packages/db/src/schema/enums.ts` and generate a migration.
2. **Copy a platform folder.** `cp -R src/shopee src/line`. You now have `columns.ts`, `status-map.ts`, `adapter.ts` and `adapter.test.ts`.
   - `columns.ts`: replace the alias lists with the real header names, Thai and English. Mark anything you have not seen in a real export with `// VERIFY:`.
   - `status-map.ts`: replace the platform status labels.
   - `adapter.ts`: rename the class, set `kind`, `displayName` and `sourceHint`, and adjust `READ_OPTIONS` / `FIRST_DATA_ROW` if the export has extra rows above the data.
3. **Register it.** Add the instance to `adapters` and to `byKind` in `src/registry.ts`, and export it from `src/index.ts`.
4. **Prove it.** Add `fixtures/line-orders.sample.csv` (fake data, 3-6 rows) and un-skip the detect tests in `src/line/adapter.test.ts`. `bun test` must stay green, and `src/registry.test.ts` will fail if your new aliases are ambiguous with an existing platform - that failure is the feature.

Nothing outside this package changes, except the enum in step 1.

## Swap a file adapter for an API adapter without touching the core

When Shopee OpenAPI access is approved:

1. Create `src/shopee/api-adapter.ts` with a class that implements the **same** `OrderSourceAdapter` interface.
   - `detect()` returns `{ kind: 'shopee', confidence: 0, reason: 'API adapter - nothing to sniff' }`, because there is no uploaded file to identify.
   - `parse()` ignores `file.bytes`, calls the Shopee API, and maps the response into the same `NormalizedOrder` shape the file adapter produces.
     Keep the raw API payload in `NormalizedOrder.raw`, exactly like the file adapter keeps the raw rows.
2. Change one line in `src/registry.ts`: `shopeeAdapter` becomes `shopeeApiAdapter`.
3. Delete nothing. Keep the file adapter registered as a manual fallback for the days the API is down or a back-dated export has to be re-imported.

`packages/core`, `packages/db`, `apps/api` and `apps/web` do not change, because none of them ever imported the concrete class.
That is the whole reason the port exists.

## What is real and what is a stub

| Area | State |
| --- | --- |
| `src/shared/read-tabular.ts` | real - CSV + XLSX, magic-byte sniffing, BOM stripping |
| `src/shared/header-match.ts` | real - normalisation, alias resolution, signature scoring |
| `src/shared/parse-values.ts` | real - Thai numbers, money to satang, dates with timezone |
| `src/shared/group-rows.ts` | real - groups export rows into orders |
| `src/registry.ts` | real |
| `*/columns.ts`, `*/status-map.ts` | real data, but marked `// VERIFY:` where it was written from memory |
| `*/adapter.ts` `detect()` | real |
| `*/adapter.ts` `parse()` | **skeleton** - the plumbing runs, the field-by-field mapping is `TODO BLOCK 1` / `TODO BLOCK 2` and it throws `NotImplementedError` |

## Testing

```
bun test packages/adapters
```

The detect tests must always pass.
The parse tests are `test.skip` with the assertions already written: delete `.skip` one test at a time as you fill in the TODO blocks.
