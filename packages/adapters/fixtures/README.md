# Sample export fixtures

**ไฟล์ในโฟลเดอร์นี้เป็นข้อมูลปลอมทั้งหมด / every file here is fake.**

These are hand-written miniature versions of the real marketplace order exports.
They exist for two reasons:

1. they power the unit tests in `src/*/adapter.test.ts` and `src/registry.test.ts`,
2. they power the demo's "ลองใช้ไฟล์ตัวอย่าง" (try it with a sample file) button on the import screen.

## Never commit a real customer export

A real Shopee / Lazada / TikTok export contains buyer names, phone numbers, addresses and order values.
That is personal data under PDPA (พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล).
Putting one in git means it lives in the history forever, on every developer laptop and every CI runner.

If you need to debug a real file:

- work on it locally, outside the repository,
- or anonymise it first: replace buyer names, phone numbers and addresses, and keep only the rows you need,
- and add it to `.gitignore` before you open the folder in an editor that auto-stages files.

## What each fixture covers

| File | Rows | Covers |
| --- | --- | --- |
| `shopee-orders.sample.csv` | 5 data rows, 4 orders | Thai headers, **UTF-8 BOM**, a 2-line order, a money cell with `฿` and a thousands separator, a cancelled order |
| `lazada-orders.sample.csv` | 5 data rows, 4 orders | camelCase headers, **one row per unit** (order `...002` is 2 rows of the same SKU), `paidPrice` vs `unitPrice`, a returned order |
| `tiktok-orders.sample.csv` | 4 data rows, 3 orders | a **description row under the header**, day-first dates, `Order Substatus`, 19 digit order ids, a 2-line order |

## Keeping them honest

The column headers come from `src/<platform>/columns.ts`.
If you change a fixture header, the detect tests will tell you immediately.
If a real export turns out to use a different header, fix `columns.ts` **and** the fixture in the same commit, and remove the matching `// VERIFY:` comment.
