# Wave 3 plan: brief items F, H, J

- Date: 2026-09-19
- Status: approved for execution
- Orchestrator: Prime session (this plan is committed; only the orchestrator edits it)
- Builds on: `2026-09-17-wave-1-core.md` (done) and `2026-09-18-wave-2-core.md` (done, merged)
- Integration branch: `wave-1-core` (currently equal to `main` at 021d4b2)
- The user calls this batch their Wave 2. In this repo the previous batches were wave 1 and wave 2 core, so this plan is wave 3.

## Source brief (verbatim from the user)

> F Import Pipeline (ต้องรอ A, B, C) รวมงาน A, B, C เป็นขั้นตอนเดียวที่ผู้ใช้ทำได้จริง คือลากไฟล์เข้ามา ดูผลก่อนยืนยัน แล้วตัดสต็อก ผู้ใช้ต้องเห็นชัดว่าออเดอร์ไหนตัดได้ ออเดอร์ไหนติดปัญหา SKU และออเดอร์ไหนถูกข้ามเพราะยกเลิกหรือเคย Import แล้ว ต้องมั่นใจว่าการ Import ไฟล์เดิมซ้ำจะไม่ตัดสต็อกซ้ำ และถ้าไฟล์ใหม่บอกว่าออเดอร์ที่เคยตัดไปแล้วถูกยกเลิกหรือคืน สต็อกต้องกลับมาถูกต้อง ควรเก็บไฟล์ต้นฉบับและผลแต่ละครั้งไว้ตรวจย้อนหลัง
>
> H เปิดบิลขายส่ง/หน้าร้าน (ต้องรอ A, D) หน้าจอขายที่พนักงานใช้ได้เร็ว เลือกลูกค้าแล้วราคาขึ้นตามระดับเอง เห็นสต็อกคงเหลือขณะขาย และออกบิลเป็น PDF ภาษาไทยได้ (เลือกวิธีสร้าง PDF ที่รันบน Workers ได้ หรือสร้างฝั่ง browser) การขายหน้าร้านต้องตัดสต็อกจากคลังกลางเดียวกับออนไลน์ และยกเลิกบิลแล้วสต็อกต้องคืน
>
> J ประวัติสต็อก + Dashboard (ต้องรอ A แต่เริ่มจากข้อมูล seed ได้) หน้าที่ตอบคำถามว่าตอนนี้ของเหลือเท่าไร อะไรใกล้หมด ขายไปเท่าไรในแต่ละช่องทาง และถ้ายอดคลาดเคลื่อนมาจากอะไร ตัวเลขทุกตัวควรคำนวณจากแหล่งเดียวกับที่ใช้ตัดสต็อก ระบบใหม่จะได้ไม่มีปัญหาข้อมูลไม่ตรงกันแบบเดียวกับ Excel

All dependencies (A, B, C, D) are done and merged, so every track below is unblocked.

## Decisions (recorded, approved by the user on 2026-09-19)

- D1 Storage for original files: use the existing `IMPORTS_BUCKET` R2 binding through `StoragePort` (`packages/core/src/ports/storage.ts`) and `createR2Storage` (`apps/api/src/adapters/r2-storage.ts`).
  - Under `wrangler dev` the binding persists to local miniflare state, so no real bucket is needed for local testing.
  - Under `bun test` the service context comes from `apps/api/src/test-utils.ts` with an in-memory storage. Extend that helper if it lacks storage.
  - Originals are never deleted (AGENTS.md rule 8).
- D2 PDF for bills: generate on the browser side. A print-ready page `/orders/[id]/print` renders the Thai bill, a button calls `window.print()`, and `@media print` CSS strips app chrome. No Workers PDF library this wave.
- D3 Preview persistence: store the parsed preview as one jsonb column `preview` on `import_batches` (nullable until first parse).
  - One write per batch, rebuilt UI without re-parsing, no new table.
  - `issues` already has its own jsonb column and stays as is.
- D4 Variance definition for J: any movement whose reason is not `purchase_in` or `sale_out` explains a balance change.
  - The card groups `adjust_in`, `adjust_out`, `cancel_restore`, `return_in` and any shortfall reason found in `MOVEMENT_REASONS` (`packages/core/src/domain/enums.ts`) by variant and day.
  - Every number is computed from `stock_movements`, `stock_lots` and `movement_lot_consumptions`, the same tables the FIFO engine writes.
- D5 Track infrastructure: branches `wave3-track-f`, `wave3-track-h`, `wave3-track-j` created from `wave-1-core`.
  - One treehouse worktree per track, leased as `plan:wave3:track-f` and so on.
  - One database per track: `stockhub_f`, `stockhub_h`, `stockhub_j`, migrated and seeded.
  - Merge order at the end: F, then H, then J, then track P (integration) runs on the merged result.
- D6 Track children do not edit this plan file. The orchestrator ticks checkboxes when a track merges. Each child keeps `TRACK-LOG.md` uncommitted in its worktree root.

## Ground rules for every track

- Iron rules from AGENTS.md apply untouched. The ones that bite here: adapters only convert data, money is integer satang, FIFO runs in one transaction with `SELECT ... FOR UPDATE`, re-import must not deduct twice, returns restore original cost, cost hiding through `ok()` plus `COST_KEYS`.
- `import type` for types, no `any`, no `!` non-null assertion, files in kebab-case.
- Comments explain why, on-screen text in Thai, errors are `StockHubError` with stable codes.
- Every screen keeps loading, empty and error states, wraps cost in `<CostValue>` and checks permissions with `PermissionGate`.
- Commit subjects at most about 50 characters, imperative, no AI co-author, one commit per concern.
- Before opening work for review run, with the track database exported as `DATABASE_URL`:
  - `bun run typecheck`
  - `bun run lint`
  - `bun test`
- No leftover `// MOCK:` in any file the track declares wired.

## Track F - Import pipeline (brief item F)

Owner: child `wave3-track-f`, branch `wave3-track-f`, database `stockhub_f`.

The service stubs in `apps/api/src/services/import-service.ts` already document the exact algorithm in comments. Implement those comments, do not redesign them.

- [ ] F1 Preview storage and migration
  - Add `preview` jsonb column to `import_batches` in `packages/db/src/schema/imports.ts`, typed with a payload interface that carries the parsed orders, per-line match results and unmatched groups so `getImportPreview` can rebuild `ImportPreviewResponse` without the file.
  - Run `bun run db:generate` and commit the SQL file.
  - Commit: `Store import preview on the batch`
- [ ] F2 uploadImport
  - Implement steps 1 to 7 from the comment block in `apps/api/src/services/import-service.ts`.
  - Generate the batch id first, build the key with `importObjectKey`, put the bytes to storage before parsing.
  - Detect with `detectAdapter` from `packages/adapters/src/registry.ts`; when detection fails throw `StockHubError('validation_error', ...)`.
  - Parse with the adapter, build the match index from `channel_listings` and variants (see `packages/core/src/services/import/matching.ts` and the listing repo from track C), run `matchSku` on every line.
  - Compute the sha-256 checksum and store it. When the checksum already exists on an applied batch for the org, still create the batch but record a duplicate warning in `issues` and mark duplicate orders as skipped in the preview (F4 semantics).
  - Persist status `preview_ready` with the preview payload. Test with fixture files from `packages/adapters/fixtures/` through `apps/api/src/test-utils.ts`.
  - Remove the `// MOCK:` from the list and preview paths in `apps/api/src/routes/imports.ts`; `listImports` becomes the simple query from its comment.
  - Commit: `Implement import upload and preview`
- [ ] F3 Preview read and manual match
  - Implement `getImportPreview` and `saveManualMatch` in the same service.
  - The preview response groups orders for the UI: `willDeduct` (matched, not cancelled, not duplicate), `needsMatch` (grouped unmatched with suggestions), `skipped` (cancelled orders and orders whose `channelId + externalOrderId` already exists in `orders`).
  - `saveManualMatch` writes the `channel_listings` row through the listing repo, re-matches every line in the stored preview that used the SKU, updates the stored preview and `unmatchedCount`, and returns `unmatchedRemaining`.
  - Tests: preview shape for a fixture with one bad SKU, match fixes it, and a second import matches that SKU automatically from `listing_map`.
  - Commit: `Wire import preview and manual match`
- [ ] F4 applyImport
  - Implement the eight-step transaction from the `applyImport` comment exactly: re-read the batch `FOR UPDATE`, refuse when unmatched and not ignored, upsert orders idempotently on `(channelId, externalOrderId)`, `expandBundles`, lock affected lots in a consistent order, `planMovements`, insert movements and lot updates, set status `applied`.
  - Marketplace sales use `consumeFifo` with `onShortage: 'shortfall'`. An order already applied earlier that the new file marks cancelled or returned restores with `restoreFifo` on the original consumption.
  - The lifeline tests (AGENTS.md rule 6): importing the same file twice leaves stock unchanged, and a later file that marks a previously applied order as cancelled brings the stock back at the original cost. Write both.
  - Commit: `Implement import apply in one transaction`
- [ ] F5 Web screens for the pipeline
  - `apps/web/src/app/imports/new/page.tsx`: real upload with drag and drop, detected channel display, checksum duplicate warning, error state.
  - `apps/web/src/app/imports/page.tsx`: real batch list with status badges.
  - `apps/web/src/app/imports/[id]/page.tsx`: three visible groups from the brief (ตัดได้, ติดปัญหา SKU, ถูกข้าม), inline match flow reusing the variant picker from track C, apply button with a confirm dialog that restates the counts.
  - Extend `apps/web/src/lib/api-client.ts` and `api-types.ts` for the four import endpoints. Keep the edits additive and inside an `imports` section to reduce merge conflicts.
  - Commit: `Wire import screens to the real pipeline`

## Track H - Billing for wholesale and counter sales (brief item H)

Owner: child `wave3-track-h`, branch `wave3-track-h`, database `stockhub_h`.

Server side is already done by earlier waves: `createPosOrder`, `cancelOrder` and `returnOrder` exist in `apps/api/src/services/order-service.ts` with routes under `apps/api/src/routes/orders.ts`. This track is screen work plus the print view.

- [ ] H1 Fast billing screen
  - Rewrite `apps/web/src/app/orders/new/page.tsx` from mock to real.
  - Customer select loads from `/customers` and shows the tier name; after selection each line price previews through `/pricing/resolve` so the tier price is visible before submitting.
  - Product search over the catalog, live on-hand per variant while selling, quantity inputs, line totals and grand total in baht.
  - Submit through `POST /orders` with `channelKind` `pos` or `wholesale` and the chosen `customerId`, then redirect to the new detail page from H2.
  - Gate the page with `PermissionGate` on `order:create`. Commit: `Build the real billing screen`
- [ ] H2 Order detail page with cancel and return
  - New page `apps/web/src/app/orders/[id]/page.tsx`: bill header (customer, tier name, channel, status), lines with unit price and line total, grand total, and the actions the status allows.
  - Cancel calls `POST /orders/:id/cancel` after a confirm dialog that says stock returns. Return opens a small dialog for per-line quantities and restock flag, calling `POST /orders/:id/return`.
  - Loading, empty and error states. Link from the orders list rows. Commit: `Add order detail with cancel and return`
- [ ] H3 Thai printable bill
  - New route `apps/web/src/app/orders/[id]/print/page.tsx` rendering a clean A4 bill in Thai: seller header placeholder, bill number, date, customer with phone, lines, totals, thank-you note.
  - No cost fields ever appear on the bill. Use the wire order shape, which is already stripped server side.
  - `@media print` CSS hides all app chrome, and a visible button calls `window.print()`. Link to it from the detail page.
  - Commit: `Add Thai printable bill view`

## Track J - Stock history and dashboard (brief item J)

Owner: child `wave3-track-j`, branch `wave3-track-j`, database `stockhub_j`.

The aggregate recipe is already written in the mock comment at the top of `apps/api/src/routes/dashboard.ts`.

- [ ] J1 Real dashboard summary
  - Implement `GET /dashboard/summary` with the eight aggregates from the comment, run in one `Promise.all`.
  - `todaySold` uses `date_trunc('day', now() at time zone 'Asia/Bangkok')` so today means Bangkok today.
  - Wire `apps/web/src/app/(dashboard)/page.tsx` cards to the real data with loading, empty and error states. `stockValue` stays a cost field and must already be in `COST_KEYS` (verify, add only if missing).
  - Commit: `Compute the dashboard summary from stock data`
- [ ] J2 Channel sales and variance
  - New endpoint `GET /reports/channel-sales?days=7` in `apps/api/src/routes/reports.ts`: units and revenue grouped by channel from orders and order lines, permission `order:read`.
  - New endpoint `GET /reports/variance?days=7`: per variant and day totals for the reasons in decision D4, permission `stock:read`. This is the answer to ยอดคลาดเคลื่อนมาจากอะไร.
  - The dashboard page gains two sections: a sales per channel table and a recent variance table that links to `/movements`.
  - Extend the web client in a `reports` section, additive only. Commit: `Add channel sales and variance reports`
- [ ] J3 Real COGS report
  - Replace `mockCogsReport` in `apps/api/src/routes/reports.ts` with a real aggregation from `movement_lot_consumptions` joined to movements by day and channel, keeping the existing `cost:read` block at 403.
  - Wire `apps/web/src/app/reports/cogs/page.tsx` to the real data. Commit: `Compute the COGS report from real consumption`

## Track P - Integration (runs after F, H and J merge)

Owner: the orchestrator, on worktree 1.

- [ ] P1 Merge `wave3-track-f`, then `wave3-track-h`, then `wave3-track-j` into `wave-1-core`, resolving `api-client.ts` and `api-types.ts` conflicts by keeping every section.
- [ ] P2 Contract audit and leak scan: run the existing audits, extend `LEAK_SCAN_DB_PATHS` and the reverse audit for any new cost-bearing response fields (import cogs, dashboard stockValue, reports).
- [ ] P3 Full verification with the shared database: typecheck, lint, `bun test` with `0 skip`.
- [ ] P4 End-to-end journey per the section below.
- [ ] P5 Tick this plan, update `apps/api/README.md` contract table, fast-forward `main`.

## End-to-end verification (orchestrator, on the merged branch)

- Reset the shared database with `bun run db:migrate` and `bun run db:seed` against `stockhub`.
- Start `wrangler dev --port 8788` for the api and `next dev --port 3100` for the web.
- Import journey with curl, role manager:
  - `POST /api/v1/imports` with `packages/adapters/fixtures/lazada-orders.sample.csv` attached as multipart `file`, expect 201 and `preview_ready` with counts equal to the adapter fixture expectations.
  - `GET /api/v1/imports/:id` shows the `willDeduct`, `needsMatch` and `skipped` groups.
  - Record on-hand of one affected variant, `POST /api/v1/imports/:id/apply`, expect on-hand to drop by exactly the matched sold units and `cogs` in the result to be present for owner and absent for sales.
  - Re-upload the same file: duplicate warning appears, apply is a no-op for already applied orders, stock unchanged.
  - Upload a synthetic file where a previously applied order is cancelled: apply restores that order stock at the original cost.
- Billing journey, role sales:
  - Bill two units of a variant for a customer with a tier, confirm the unit price equals `/pricing/resolve`, stock drops, and `GET /orders/:id/print` returns printable Thai HTML with no cost keys anywhere.
  - Cancel the bill, stock returns.
- Dashboard journey:
  - `/dashboard/summary`, `/reports/channel-sales` and `/reports/variance` return numbers consistent with the movements the two journeys just created.
  - `stockValue` is present for owner and absent for sales and stock_staff.
- Manual UI walkthrough left to the user: the import three-group screen, the billing screen, the print view, the dashboard cards.
