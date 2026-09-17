# AGENTS.md

คู่มือสำหรับ AI agent และนักพัฒนาที่เข้ามาทำงานใน repository นี้
อ่านไฟล์นี้ให้จบก่อนแก้โค้ดบรรทัดแรก

---

## 1. บริบทของโปรเจกต์

StockHub คือระบบรวมสต็อกหลายช่องทางขายไว้ในคลังกลางเดียว
ตอนนี้อยู่ในสถานะ **boilerplate** คือมีโครงสร้าง สัญญา (contract) และหน้าจอครบ แต่ business logic ยังเป็น stub

เครื่องหมายที่ใช้ทั่ว repository:

| เครื่องหมาย | ความหมาย |
| --- | --- |
| `TODO(template)` | ช่องว่างที่ตั้งใจเว้นไว้ให้เขียนต่อ มีคำอธิบายอัลกอริทึมกำกับเสมอ |
| `NotImplementedError` | ฟังก์ชันที่มี signature ครบแล้วแต่ยังไม่มี logic |
| `// MOCK:` | ข้อมูลปลอมที่ใส่ไว้ให้หน้าจอ render ได้ ต้องลบเมื่อต่อของจริง |
| `// VERIFY:` | ค่าที่เดามา ต้องเทียบกับไฟล์ export จริงก่อนเชื่อ |

เมื่อได้งาน ให้ grep เครื่องหมายเหล่านี้ก่อน เพื่อดูว่างานที่ขอเกี่ยวกับ stub ตัวไหน

---

## 2. กฎเหล็ก

1. **`packages/core` ห้าม import framework**
   ห้าม import Next.js, Hono, Drizzle, React หรือ Cloudflare runtime เข้าไปใน `packages/core` เด็ดขาด
   core ต้องทดสอบได้ด้วย `bun test` เปล่า ๆ
   ถ้ารู้สึกว่าต้อง import แปลว่า logic นั้นควรอยู่ใน `apps/api/src/services/` แทน

2. **Adapter แปลงข้อมูลอย่างเดียว**
   ไฟล์ใน `packages/adapters` ห้ามแตะฐานข้อมูล ห้ามเรียก HTTP ห้ามตัดสินใจเรื่องสต็อก
   หน้าที่มีอย่างเดียวคือรับไฟล์แล้วคืน `NormalizedOrder[]`
   Adapter ห้าม throw เมื่อเจอแถวเสีย ให้ push เข้า `issues` แล้วทำต่อ เพราะแถวเดียวพังต้องไม่ทำให้ไฟล์ 2,000 แถวล้ม

3. **เงินเป็นจำนวนเต็มหน่วยสตางค์เสมอ**
   ใช้ type `Satang` จาก `@stockhub/core` ห้ามใช้ float กับเงินทุกกรณี
   แปลงเป็นทศนิยมเฉพาะตอนแสดงผลหรือ export เท่านั้น

4. **การซ่อนต้นทุนบังคับที่ API**
   ทุก response ต้องผ่าน `ok()` ใน `apps/api/src/lib/response.ts` ซึ่งเรียก `stripCost()` ให้อัตโนมัติ
   การซ่อนใน React เป็นแค่ความสวยงาม ไม่ใช่ security
   เมื่อเพิ่ม field ที่มีต้นทุน ต้องเพิ่ม key นั้นใน `COST_KEYS` ที่ `packages/core/src/rbac.ts` ด้วย

5. **FIFO ต้องอยู่ใน transaction เดียว**
   อ่านล็อตด้วย `SELECT ... FOR UPDATE` คำนวณด้วยฟังก์ชัน pure แล้วเขียนกลับ ทั้งหมดใน transaction เดียวกัน
   ห้ามคำนวณ FIFO นอก transaction ไม่ว่ากรณีใด

6. **การ import ไฟล์ซ้ำต้องไม่ตัดสต็อกซ้ำ**
   unique constraint `(channelId, externalOrderId)` บนตาราง `orders` คือเส้นตายของกฎนี้
   ถ้าเปลี่ยน logic การ import ต้องเขียน test ที่ import ไฟล์เดิมสองครั้งแล้วยอดสต็อกต้องเท่าเดิม

7. **การคืนสินค้าคืนต้นทุนเดิม**
   `restoreFifo` รับ `LotConsumption[]` ของการขายเดิม ไม่ใช่รับจำนวนแล้วตีราคาวันนี้

---

## 3. ใครเป็นเจ้าของโฟลเดอร์ไหน

| โฟลเดอร์ | หน้าที่ | ห้ามมีอะไร |
| --- | --- | --- |
| `packages/core` | โดเมนล้วน กฎธุรกิจ type กลาง | framework, I/O, SQL, fetch |
| `packages/adapters` | อ่านไฟล์ export ของแต่ละแพลตฟอร์ม | DB, HTTP, การตัดสต็อก |
| `packages/db` | schema, migration, repository, seed | กฎธุรกิจ, HTTP |
| `apps/api` | HTTP routing, auth, orchestration | กฎธุรกิจที่ควรอยู่ใน core |
| `apps/web` | UI | การคำนวณต้นทุน, การตัดสินสิทธิ์แบบเขียนเอง |

ถ้ากำลังจะเขียน logic แล้วไม่แน่ใจว่าวางที่ไหน ให้ถามว่า "ทดสอบมันโดยไม่ต้องมี DB และ HTTP ได้ไหม"
ถ้าได้ ให้ไป `packages/core`

---

## 4. Convention

### TypeScript

- strict mode เปิดทุก flag ห้ามปิดใน package ย่อย ถ้าจำเป็นต้อง override ให้เขียน comment บอกเหตุผล
- ใช้ `import type` สำหรับ type เสมอ เพราะเปิด `verbatimModuleSyntax`
- ห้ามใช้ `any` ถ้าเลี่ยงไม่ได้ให้ใช้ `unknown` แล้ว narrow
- ห้ามใช้ `!` (non-null assertion) ให้ handle กรณี undefined จริง ๆ เพราะเปิด `noUncheckedIndexedAccess`

### การตั้งชื่อ

- ไฟล์เป็น `kebab-case.ts`
- type และ interface เป็น `PascalCase` ฟังก์ชันและตัวแปรเป็น `camelCase`
- ค่าคงที่ที่เป็น array ของ union เป็น `SCREAMING_SNAKE_CASE` และประกาศคู่กับ type เสมอ
- ตารางฐานข้อมูลเป็น `snake_case` พหูพจน์ ส่วนตัวแปร Drizzle เป็น `camelCase`

### Enum

- แหล่งความจริงเดียวคือ `packages/core/src/domain/enums.ts`
- `packages/db/src/schema/enums.ts` เป็นเงาของไฟล์นั้น
- แก้ที่ core ก่อนเสมอ แล้วแก้ที่ db แล้วจึง `bun run db:generate`

### Error

- โยน `StockHubError` หรือคลาสลูกเท่านั้น เพื่อให้ error middleware แปลงเป็น HTTP status ได้
- ทุก error ต้องมี `code` ที่คงที่ เพราะ frontend ใช้ `code` ไม่ใช่ข้อความ

### Comment

- เขียน comment เป็นภาษาอังกฤษ ส่วนข้อความบนหน้าจอเป็นภาษาไทย
- comment ต้องอธิบาย **ทำไม** ไม่ใช่ **ทำอะไร**
- stub ทุกตัวต้องมี comment บอกขั้นตอนของอัลกอริทึมที่ตั้งใจไว้

### Markdown

- เขียนหนึ่งประโยคต่อหนึ่งบรรทัด เพื่อให้ diff อ่านง่าย
- ห้ามใช้อักขระ em dash ใช้ขีดสั้นแทน

---

## 5. วิธีเพิ่มของ

### เพิ่ม endpoint ใหม่

1. เพิ่ม zod schema ที่ `apps/api/src/schemas/`
2. เพิ่ม handler ใน router ที่เกี่ยวข้องใน `apps/api/src/routes/`
3. คืนค่าผ่าน `ok()` หรือ `paginated()` เท่านั้น
4. ถ้าต้องใช้สิทธิ์ ให้ครอบด้วย `requirePermission()`
5. เพิ่ม type และฟังก์ชันใน `apps/web/src/lib/api-types.ts` และ `api-client.ts` ให้ตรงกัน
6. อัปเดตตารางสัญญาใน `apps/api/README.md`

### เพิ่มหน้าจอใหม่

1. สร้าง route ใต้ `apps/web/src/app/`
2. ดึงข้อมูลผ่าน `api-client.ts` เท่านั้น ห้าม `fetch` ตรง
3. ต้องมีครบสามสถานะ คือ loading, empty และ error
4. ตัวเลขต้นทุนทุกตัวต้องห่อด้วย `<CostValue>`
5. เพิ่มลิงก์ใน sidebar ที่ `apps/web/src/app/layout.tsx`

### เพิ่มตารางใหม่

1. เขียน schema ใน `packages/db/src/schema/` ไฟล์ตามกลุ่มงาน
2. ใส่ `orgId` และ index บน `orgId` เสมอ
3. เงินใช้ bigint หน่วยสตางค์ เวลาใช้ timestamp with timezone
4. เพิ่ม `relations()` ให้ครบ
5. รัน `bun run db:generate` แล้ว commit ไฟล์ SQL ที่ได้ ห้ามแก้ไฟล์ SQL ด้วยมือ
6. เพิ่มข้อมูลใน seed ถ้าตารางนั้นจำเป็นต่อ demo

### เพิ่มแพลตฟอร์มใหม่

ดูขั้นตอน 4 ข้อใน `packages/adapters/README.md`
ถ้าต้องแก้ไฟล์นอก `packages/adapters` มากกว่าการเพิ่มค่าใน `CHANNEL_KINDS` แปลว่าออกแบบผิด ให้หยุดแล้วทบทวน

---

## 6. คำสั่งที่ต้องรู้

| คำสั่ง | ใช้เมื่อไร |
| --- | --- |
| `bun install` | หลัง clone หรือหลังเพิ่ม dependency |
| `bun run dev` | พัฒนา รันทุก app พร้อมกัน |
| `bun run typecheck` | ก่อน commit ทุกครั้ง |
| `bun run lint` | ก่อน commit ทุกครั้ง |
| `bun test` | ก่อน commit ทุกครั้ง |
| `bun run db:generate` | หลังแก้ schema |
| `bun run db:seed` | เมื่ออยากรีเซ็ตข้อมูล demo |
| `bun run docker:up` / `docker:down` | เปิดปิด PostgreSQL |

---

## 7. การทดสอบ

- logic ล้วนทดสอบที่ `packages/core` ด้วย `bun test` ไม่ต้องมี DB
- `packages/core/src/services/costing/fifo.test.ts` คือ specification ของ FIFO ที่เขียนเป็นเทสไว้แล้ว
  ทุกเทสเป็น `.skip` อยู่ ให้ปลด `.skip` ทีละตัวขณะเขียน engine
- adapter ทดสอบด้วย fixture ใน `packages/adapters/fixtures/`
- เมื่อแก้บั๊ก ให้เขียนเทสที่ reproduce บั๊กนั้นก่อน แล้วค่อยแก้

---

## 8. ความปลอดภัยและข้อมูลลูกค้า

- **ห้าม commit ไฟล์ export จริงของลูกค้าเด็ดขาด** ใช้ fixture ที่แต่งเองเท่านั้น
  ไฟล์จริงวางไว้ที่ `data/local/` ซึ่ง gitignore ไว้แล้ว
- ห้ามใส่ค่าลับจริงในไฟล์ใด ๆ ใน repository
  ใช้ placeholder ใน `.env.example`, `.dev.vars.example` และ `wrangler.toml`
  ค่าจริงตั้งผ่าน `wrangler secret put`
- ห้าม log ข้อมูลผู้ซื้อ เช่น ชื่อ ที่อยู่ เบอร์โทร ลงใน console หรือ error tracking
- ไฟล์ต้นฉบับใน R2 เก็บถาวรเพื่อเป็นหลักฐาน ห้ามลบอัตโนมัติ

---

## 9. กติกาการ commit

- หัวข้อ commit ยาวไม่เกินประมาณ 50 ตัวอักษร ใช้รูปประโยคคำสั่ง เช่น `Add FIFO consume engine`
- อธิบายเหตุผลใน body ถ้าการเปลี่ยนแปลงไม่ชัดเจนในตัวเอง
- ห้ามใส่ชื่อ AI agent เป็น co-author
- ห้ามแก้ `CHANGELOG.md` หรือไฟล์ที่ระบุว่า auto-generated ด้วยมือ
- หนึ่ง commit ทำเรื่องเดียว การ format ทั้งไฟล์ให้แยก commit

---

## 10. Definition of Done

งานหนึ่งชิ้นถือว่าเสร็จเมื่อครบทุกข้อ

- [ ] `bun run typecheck` ผ่าน
- [ ] `bun run lint` ผ่าน
- [ ] `bun test` ผ่าน
- [ ] ถ้าแก้ schema ได้ commit ไฟล์ migration แล้ว
- [ ] ถ้าเพิ่ม endpoint ได้อัปเดต `api-client.ts` และ `api-types.ts` แล้ว
- [ ] ถ้าเพิ่ม field ที่มีต้นทุน ได้เพิ่มใน `COST_KEYS` แล้ว และทดสอบด้วย role `sales` แล้วว่าไม่หลุด
- [ ] ไม่มี `// MOCK:` ค้างในโค้ดที่ประกาศว่าต่อของจริงแล้ว
- [ ] README หรือ AGENTS.md ได้อัปเดตถ้ากติกาเปลี่ยน
