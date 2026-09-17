'use client';

/**
 * Import history. The entry point of demo step 2: one file per marketplace,
 * one central stock pool behind it.
 */

import { ChannelBadge, ImportStatusBadge } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Table,
  TableSkeleton,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  buttonClass,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatBytes, formatRelative, qty } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const HOW_IT_WORKS = [
  'ดาวน์โหลดไฟล์ออเดอร์จากหลังร้านของแต่ละแพลตฟอร์ม เช่น Shopee, Lazada หรือ TikTok Shop',
  'อัปโหลดไฟล์เข้ามาที่นี่ ระบบจะอ่านเองว่าเป็นไฟล์ของแพลตฟอร์มไหน',
  'ตรวจสอบตัวอย่างข้อมูลและจับคู่ SKU ที่ระบบยังไม่รู้จัก',
  'กดยืนยัน ระบบจะบันทึกออเดอร์และตัดสต็อกจากคลังกลางให้ทันที',
];

function HowItWorks() {
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
      <ol className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_IT_WORKS.map((line, index) => (
          <li key={line} className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
              {index + 1}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function ImportsPage() {
  const { role } = useRole();
  const router = useRouter();
  const { data, error, loading, reload } = useApi(() => api.getImports(), [role]);

  const batches = data ?? [];

  return (
    <>
      <PageHeader
        title="นำเข้าออเดอร์"
        description="อัปโหลดไฟล์ออเดอร์จากทุกช่องทางขาย แล้วตัดสต็อกจากคลังกลางที่เดียว"
        actions={
          <Link href="/imports/new" className={buttonClass('primary', 'md')}>
            <UploadCloud className="size-4" aria-hidden />
            อัปโหลดไฟล์ออเดอร์
          </Link>
        }
      />

      <HowItWorks />

      <Card>
        {loading && batches.length === 0 ? <TableSkeleton rows={6} cols={8} /> : null}
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {!loading && !error && batches.length === 0 ? (
          <EmptyState
            title="ยังไม่มีไฟล์ที่นำเข้า"
            description="เริ่มจากดาวน์โหลดไฟล์ออเดอร์จากแพลตฟอร์ม แล้วอัปโหลดเข้ามาที่นี่"
            icon={<FileSpreadsheet className="size-5" aria-hidden />}
            action={
              <Link href="/imports/new" className={buttonClass('primary', 'sm')}>
                อัปโหลดไฟล์ออเดอร์
              </Link>
            }
          />
        ) : null}

        {!error && batches.length > 0 ? (
          <TableWrap>
            <Table>
              <Thead>
                <Tr>
                  <Th>ไฟล์</Th>
                  <Th>ช่องทาง</Th>
                  <Th>สถานะ</Th>
                  <Th numeric>แถว</Th>
                  <Th numeric>ออเดอร์</Th>
                  <Th numeric>รายการ</Th>
                  <Th numeric>ปัญหา</Th>
                  <Th numeric>ยังไม่จับคู่</Th>
                  <Th>อัปโหลดเมื่อ</Th>
                  <Th>ผู้ใช้</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {batches.map((batch) => {
                  const kind = batch.channelKind ?? batch.detectedKind;
                  const needsReview = batch.status === 'preview_ready';

                  return (
                    <Tr
                      key={batch.id}
                      clickable
                      highlight={needsReview}
                      onClick={() => router.push(`/imports/${batch.id}`)}
                    >
                      <Td>
                        <span className="block max-w-xs truncate font-medium text-slate-900">
                          {batch.fileName}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatBytes(batch.fileSize)}
                        </span>
                        {batch.status === 'failed' && batch.errorMessage ? (
                          <span className="mt-0.5 block max-w-xs truncate text-xs text-rose-600">
                            {batch.errorMessage}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        {kind ? (
                          <ChannelBadge kind={kind} label={batch.channelName} />
                        ) : (
                          <span className="text-xs text-slate-400">ตรวจจับอัตโนมัติ</span>
                        )}
                      </Td>
                      <Td>
                        <ImportStatusBadge status={batch.status} />
                      </Td>
                      <Td numeric>{qty(batch.rowsRead)}</Td>
                      <Td numeric>{qty(batch.ordersParsed)}</Td>
                      <Td numeric>{qty(batch.linesParsed)}</Td>
                      <Td numeric className={batch.issueCount > 0 ? 'text-amber-600' : undefined}>
                        {qty(batch.issueCount)}
                      </Td>
                      <Td
                        numeric
                        className={
                          batch.unmatchedCount > 0 ? 'font-medium text-amber-600' : undefined
                        }
                      >
                        {qty(batch.unmatchedCount)}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatRelative(batch.uploadedAt)}
                      </Td>
                      <Td className="text-slate-600">{batch.uploadedByName ?? '-'}</Td>
                      <Td>
                        <Link
                          href={`/imports/${batch.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className={buttonClass(needsReview ? 'primary' : 'outline', 'sm')}
                        >
                          {needsReview ? 'ตรวจสอบ' : 'ดูรายละเอียด'}
                        </Link>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableWrap>
        ) : null}
      </Card>
    </>
  );
}
