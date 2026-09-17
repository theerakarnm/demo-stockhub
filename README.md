# StockHub

StockHub รวมสต็อกของร้านบน Shopee, Lazada, TikTok Shop และหน้าร้าน ไว้ในคลังกลางเดียว
ระบบตัดสต็อกจากไฟล์ export ออเดอร์ คำนวณต้นทุนแบบ FIFO และซ่อนข้อมูลต้นทุนตามตำแหน่งงาน

> **สถานะ: Boilerplate.**
> โครงสร้าง สัญญา (contract) และหน้าจอครบแล้ว ส่วน business logic เป็น stub ที่มี type signature และคำอธิบายอัลกอริทึมกำกับไว้
> ค้นหาคำว่า `TODO(template)`, `NotImplementedError`, `// MOCK:` และ `// VERIFY:` เพื่อดูงานที่เหลือ

---

## 1. โปรเจกต์นี้คืออะไร

- **ประเภทงาน:** Demo สำหรับขายงาน (pre-sales) ที่ต่อยอดเป็นระบบจริงได้ ไม่ต้องเขียนใหม่
- **ลูกค้าตั้งต้น:** บริษัทขายเครื่องมือการเกษตร มีร้านออนไลน์ 6 ร้าน และหน้าร้าน 1 สาขา
- **เป้าหมาย:** ให้ลูกค้าตัดสินใจจ้างงานหลังดู Demo 10 นาที โดยเห็นไฟล์ export ของตัวเองถูก Import ได้จริง

สิ่งที่ Demo ต้องพิสูจน์:

1. อ่านไฟล์ export จาก Shopee, Lazada, TikTok Shop แล้วตัดสต็อกได้ถูกต้อง
2. เข้าใจงานสต็อกจริง คือ FIFO, สินค้าชุด, การคืนสินค้า และออเดอร์ที่ถูกยกเลิก
3. ใช้เป็นผลงาน (portfolio) สำหรับลูกค้า retail และ e-commerce รายอื่น
4. เป็นฐานโค้ดที่ขึ้น production ได้

---

## 2. ลำดับการ Demo 10 นาที

| นาที | หน้าจอ | สิ่งที่ลูกค้าเห็น |
| --- | --- | --- |
| 0-1 | `/` Dashboard | สต็อกกลางรวมทุกช่องทาง มูลค่าสต็อก และ SKU ที่ใกล้หมด |
| 1-4 | `/imports/new` | ลากไฟล์ export จริงของลูกค้าเข้ามา ระบบเดาแพลตฟอร์มเอง แสดง preview ก่อนตัดสต็อก |
| 4-6 | `/inventory/[id]` | ต้นทุน FIFO แยกเป็นล็อต เห็นว่าออเดอร์นี้ตัดจากล็อตไหน ต้นทุนเท่าไร |
| 6-7 | ปุ่มสลับตำแหน่งงาน | สลับเป็น "พนักงานคลัง" แล้วตัวเลขต้นทุนหายทันทีทั้งระบบ |
| 7-9 | `/orders/new` | เปิดบิลขายส่งหรือหน้าร้าน แล้วสต็อกกลางลดทันที |
| 9-10 | `/movements` | ประวัติการเคลื่อนไหวสต็อกทุกใบ ย้อนได้ว่าใครทำอะไรเมื่อไร |

---

## 3. สถาปัตยกรรม

หัวใจของระบบคือการแยก **Adapter ต่อแพลตฟอร์ม** ออกจากแกนกลาง
วันนี้ Adapter อ่านไฟล์ export วันหน้าเปลี่ยนเป็นเรียก API ของแพลตฟอร์มได้ โดยไม่ต้องแก้ core, db หรือ UI

```
ไฟล์ export (.csv/.xlsx)         Shopee API (อนาคต)
        |                                |
        v                                v
+-----------------------------------------------+
|  packages/adapters                            |
|  implements OrderSourceAdapter                |
|  detect() + parse() -> NormalizedOrder[]      |
+-----------------------------------------------+
                      |
                      v  NormalizedOrder (รูปแบบกลาง ไม่ผูกกับแพลตฟอร์ม)
+-----------------------------------------------+
|  packages/core   โดเมนล้วน ไม่มี framework      |
|  FIFO costing / bundles / SKU matching / RBAC |
+-----------------------------------------------+
                      |
                      v
+------------------------+   +------------------+
|  packages/db           |   |  apps/api        |
|  Drizzle + PostgreSQL  |<->|  Hono on Workers |
+------------------------+   +------------------+
                                     ^
                                     |  REST /api/v1
                             +------------------+
                             |  apps/web        |
                             |  Next.js         |
                             +------------------+
```

กฎ 3 ข้อที่ทำให้สถาปัตยกรรมนี้อยู่ได้:

1. `packages/core` ห้าม import Next.js, Hono, Drizzle หรือ Cloudflare runtime เด็ดขาด
2. Adapter ไม่แตะฐานข้อมูล ไม่แตะ HTTP และไม่ตัดสินใจเรื่องสต็อก แค่แปลงข้อมูลเข้าเป็น `NormalizedOrder`
3. การซ่อนต้นทุนบังคับที่ API ผ่าน `stripCost()` ที่เดียว ไม่ใช่แค่ซ่อน column ใน React

### Tech stack

| ส่วน | เทคโนโลยี |
| --- | --- |
| Frontend | Next.js (App Router), React 19, Tailwind CSS |
| API | Bun + Hono, deploy เป็น Cloudflare Worker |
| Database | PostgreSQL + Drizzle ORM (ผ่าน Cloudflare Hyperdrive บน production) |
| ไฟล์ต้นฉบับที่ Import | Cloudflare R2 |
| Package manager | Bun workspaces |
| Lint / format | Biome |
| Test | `bun test` |

---

## 4. โครงสร้าง Repository

```
stockhub-demo/
├── apps/
│   ├── api/                 Hono API บน Cloudflare Workers
│   │   └── src/
│   │       ├── routes/      1 ไฟล์ต่อ 1 resource
│   │       ├── services/    orchestration ระหว่าง core + db + adapters
│   │       ├── middleware/  auth, db, permission, error
│   │       └── adapters/    R2 storage
│   ├── runtime-probe/       Worker ทดสอบไลบรารีบน workerd (xlsx, pdf-lib, postgres.js)
│   └── web/                 Next.js App Router
│       └── src/
│           ├── app/         หน้าจอตามลำดับ demo
│           ├── components/  UI ที่เขียนเอง ไม่มี component library หนัก
│           └── lib/         api-client, api-types, mock-data
├── packages/
│   ├── core/                โดเมนล้วน ไม่มี framework  <-- เริ่มอ่านที่นี่
│   │   └── src/
│   │       ├── domain/      enums, branded ids, money (satang)
│   │       ├── ports/       OrderSourceAdapter, StoragePort, Clock
│   │       ├── services/    FIFO, bundle, SKU matching, movement planning
│   │       └── rbac.ts      สิทธิ์ตามตำแหน่งงาน + stripCost()
│   ├── adapters/            Shopee / Lazada / TikTok file adapters + fixtures
│   └── db/                  Drizzle schema, repositories, seed
├── docker-compose.yml       PostgreSQL 16 สำหรับ dev
├── biome.json
├── tsconfig.base.json
├── AGENTS.md                กติกาสำหรับ AI agent และนักพัฒนาใหม่
└── README.md
```

---

## 5. เริ่มใช้งาน

ต้องมี Bun 1.3 ขึ้นไป, Docker และ Node 20 ขึ้นไป

```bash
# 1. ติดตั้ง dependency ทั้ง workspace
bun install

# 2. เตรียม environment
cp .env.example .env
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env.local

# 3. เปิดฐานข้อมูล
bun run docker:up

# 4. สร้าง schema แล้วใส่ข้อมูลตัวอย่าง
bun run db:push
bun run db:seed

# 5. รัน API และ Web พร้อมกัน
bun run dev
```

| บริการ | URL |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:8787 |
| Drizzle Studio | `bun run db:studio` |

พอร์ตของ Postgres คือ **5435** (พอร์ต 5432-5434 ในเครื่องนี้ถูกโปรเจกต์อื่นยึดอยู่)
คำสั่ง `bun run docker:up` ใช้ `podman-compose` ถ้าเครื่องไหนมี Docker จริง ให้รัน `docker compose up -d` แทนได้เลย

### คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
| --- | --- |
| `bun run dev` | รันทุก app พร้อมกัน |
| `bun run dev:web` / `bun run dev:api` | รันทีละตัว |
| `bun run typecheck` | ตรวจ TypeScript ทั้ง workspace |
| `bun run lint` | Biome check |
| `bun test` | รัน unit test |
| `bun run db:generate` | สร้างไฟล์ migration SQL หลังแก้ schema |
| `bun run db:migrate` | รัน migration |
| `bun run db:seed` | ใส่ข้อมูล demo ใหม่ |

---

## 6. Data Model โดยย่อ

| กลุ่ม | ตาราง | หน้าที่ |
| --- | --- | --- |
| องค์กร | `organizations`, `users` | ผู้ใช้ 1 คนมี 1 ตำแหน่งงาน ซึ่งกำหนดสิทธิ์เห็นต้นทุน |
| สินค้า | `products`, `variants`, `bundle_components` | `variants` คือหน่วยที่มีสต็อกจริง ส่วน bundle ไม่มีสต็อกของตัวเอง แต่กินสต็อกของ component |
| ช่องทางขาย | `channels`, `channel_listings` | `channel_listings` คือตารางที่ผูก SKU ของแพลตฟอร์มเข้ากับ SKU ภายใน |
| สต็อก | `warehouses`, `stock_lots`, `stock_movements`, `movement_lot_consumptions` | `stock_lots` คือชั้นต้นทุน FIFO ส่วน `movement_lot_consumptions` คือหลักฐานว่าการตัดสต็อกครั้งนั้นกินล็อตไหนไปเท่าไร |
| ออเดอร์ | `orders`, `order_lines` | unique `(channelId, externalOrderId)` ทำให้ import ไฟล์เดิมซ้ำแล้วไม่ตัดสต็อกซ้ำ |
| การนำเข้า | `import_batches` | เก็บสถานะ ไฟล์ต้นฉบับใน R2 และ issue ที่เจอตอน parse |

หลักการที่ห้ามละเมิด:

- **เงินทุกจำนวนเก็บเป็นจำนวนเต็มหน่วยสตางค์** ไม่ใช้ float เพราะ FIFO จะเพี้ยน ดู `packages/core/src/domain/money.ts`
- **การคำนวณ FIFO ต้องอยู่ใน transaction เดียว** และ lock แถว `stock_lots` ด้วย `SELECT ... FOR UPDATE`
- **การคืนสินค้าไม่ใช่การรับสินค้าใหม่** ต้องคืนต้นทุนเดิมที่ตอนขายตัดไป ไม่ใช่ต้นทุนวันนี้
- **ทุกตารางธุรกิจมี `orgId`** เพื่อรองรับหลายบริษัทตั้งแต่วันแรก

---

## 7. การซ่อนต้นทุนตามตำแหน่งงาน

| ตำแหน่ง | เห็นสต็อก | เห็นต้นทุน / กำไร | นำเข้าไฟล์ | เปิดบิล | จัดการผู้ใช้ |
| --- | --- | --- | --- | --- | --- |
| เจ้าของกิจการ | ได้ | ได้ | ได้ | ได้ | ได้ |
| ผู้จัดการ | ได้ | ได้ | ได้ | ได้ | ไม่ได้ |
| พนักงานคลัง | ได้ | **ไม่ได้** | ได้ | ไม่ได้ | ไม่ได้ |
| พนักงานขาย | ได้ | **ไม่ได้** | ไม่ได้ | ได้ | ไม่ได้ |

บังคับใช้ 2 ชั้น:

1. **API (ชั้นจริง)** `ok()` ใน `apps/api/src/lib/response.ts` เรียก `stripCost()` เมื่อ role ไม่มีสิทธิ์ `cost:read` ตัวเลขต้นทุนจึงไม่เคยออกจากเซิร์ฟเวอร์
2. **UI (ชั้นสวยงาม)** `<CostValue>` แสดง `••••` พร้อมไอคอนกุญแจ เพื่อให้ลูกค้าเห็นตอน demo ว่าฟีเจอร์นี้มีอยู่

---

## 8. เพิ่มแพลตฟอร์มใหม่

1. สร้างโฟลเดอร์ `packages/adapters/src/<platform>/`
2. เขียน `columns.ts` (ชื่อคอลัมน์ในไฟล์ export ทั้งไทยและอังกฤษ) และ `status-map.ts`
3. เขียน `adapter.ts` ที่ implement `OrderSourceAdapter` จาก `@stockhub/core`
4. ลงทะเบียนใน `packages/adapters/src/registry.ts` และเพิ่มค่าใน `CHANNEL_KINDS`

ไม่ต้องแก้ `apps/api`, `apps/web` หรือ `packages/db` เลย
รายละเอียดอยู่ใน `packages/adapters/README.md`

---

## 9. Deploy

มี 3 สภาพแวดล้อม

| สภาพแวดล้อม | ที่อยู่ | วิธี deploy |
| --- | --- | --- |
| Local | `wrangler dev` บนพอร์ต 8787 | `bun run dev:api` |
| Staging | https://stockhub-api-staging.theerakarnm.workers.dev | push ไป `main` (CI จะ deploy เองเมื่อใส่ secret แล้ว) หรือ `cd apps/api && bunx wrangler deploy --env staging` |
| Production | ยังไม่เปิด | `bunx wrangler deploy --env production` หลังเตรียม resource |

ก่อนเปิด production ให้เตรียม resource ครั้งเดียว

```bash
bunx wrangler r2 bucket create stockhub-imports
bunx wrangler hyperdrive create stockhub-db --connection-string "postgresql://..."
# นำ id ที่ได้ไปใส่ใน apps/api/wrangler.toml
```

CI บน GitHub Actions (`.github/workflows/ci.yml`) รันทุก push และ PR
มี 3 job คือ quality, database (migration + seed + guard test) และ build (web build + worker dry-run)
job สุดท้ายคือ deploy staging ซึ่งต้องตั้ง repo secret สองตัวก่อน คือ `CLOUDFLARE_API_TOKEN` และ `CLOUDFLARE_ACCOUNT_ID`

ค่าลับทั้งหมดตั้งผ่าน `bunx wrangler secret put <NAME>` ห้าม commit ลงไฟล์

### Runtime probe

`apps/runtime-probe` เป็น Worker เล็กที่พิสูจน์ว่าไลบรารีสำคัญทำงานได้บน workerd จริง ได้แก่ อ่าน/เขียน Excel (SheetJS), สร้าง PDF (pdf-lib) และเชื่อม Postgres (postgres.js ผ่าน nodejs_compat)

```bash
bun run --filter @stockhub/runtime-probe dev   # รันที่ http://localhost:8799
curl http://localhost:8799/probe/all
```

มีสำเนา staging ที่ https://stockhub-runtime-probe-staging.theerakarnm.workers.dev/probe/all

---

## 10. งานที่เหลือก่อนขึ้น production

- [ ] เขียน FIFO engine ใน `packages/core/src/services/costing/fifo.ts` และปลด `.skip` ใน `fifo.test.ts`
- [ ] เขียน `planMovements`, `expandBundles`, `matchSku`
- [ ] เขียน parse ของแต่ละ adapter ให้ครบ และตรวจชื่อคอลัมน์ทุกจุดที่มี `// VERIFY:` กับไฟล์ export จริง
- [ ] ต่อ route ใน `apps/api` เข้ากับฐานข้อมูลจริง แล้วลบ `// MOCK:` ทิ้ง
- [ ] ลบ `apps/web/src/lib/mock-data.ts`
- [ ] เปลี่ยน demo role header เป็นระบบ auth จริง
- [ ] เพิ่ม audit log, การจองสต็อก (reserved) และการนับสต็อก (stock count)
- [ ] เพิ่ม integration test ที่ import ไฟล์จริงแล้วตรวจยอดสต็อกปลายทาง

แต่ละ package มีไฟล์ `HANDOFF.md` ที่เรียงลำดับงานที่ควรทำต่อไว้แล้ว ให้เริ่มจากไฟล์นั้น

| package | ไฟล์ |
| --- | --- |
| Database | `packages/db/HANDOFF.md` |
| Adapters | `packages/adapters/HANDOFF.md` |
| API | `apps/api/HANDOFF.md` |
| Web | `apps/web/HANDOFF.md` |

---

## License

Proprietary. ใช้ภายในและเพื่อนำเสนองานเท่านั้น
