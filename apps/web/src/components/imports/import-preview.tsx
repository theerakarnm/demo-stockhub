'use client';

/**
 * The import preview. Used by /imports/new (step 4) and by /imports/[id], so
 * the shop sees exactly the same screen whether it just uploaded the file or
 * came back to it later.
 *
 * It renders what the API returned and nothing else: no stock maths, no cost
 * maths. The only writes it performs are the two endpoints the user asks for,
 * match and apply.
 */

import { ChannelBadge, ImportStatusBadge, OrderStatusBadge } from '@/components/domain-badges';
import { ApplyResultPanel } from '@/components/imports/apply-result-panel';
import { ParseIssuesList } from '@/components/imports/parse-issues-list';
import { PreviewOrdersTable } from '@/components/imports/preview-orders-table';
import { UnmatchedPanel } from '@/components/imports/unmatched-panel';
import { useRole } from '@/components/role-provider';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Table,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  buttonClass,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ApiError } from '@/lib/api-error';
import type { ApplyImportResult, ImportDetailResponse, PreviewSkippedOrder } from '@/lib/api-types';
import { cn } from '@/lib/cn';
import { baht, formatDateTime, qty } from '@/lib/format';
import { useMutation } from '@/lib/use-api';
import { AlertTriangle, CheckCircle2, ClipboardList, PackageCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export interface ImportPreviewProps {
  detail: ImportDetailResponse;
  /** Re-fetch the detail. Called after a SKU match and after a successful apply. */
  onReload: () => void;
}

function SummaryStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        tone === 'neutral' && 'border-slate-200 bg-white',
        tone === 'good' && 'border-emerald-200 bg-emerald-50/70',
        tone === 'warn' && 'border-amber-200 bg-amber-50/70',
        tone === 'bad' && 'border-rose-200 bg-rose-50/70',
      )}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{qty(value)}</p>
    </div>
  );
}

/** Applied and failed batches keep no preview payload, so say so plainly. */
function NoPreviewState({ detail }: { detail: ImportDetailResponse }) {
  const { batch } = detail;

  if (batch.status === 'failed') {
    return (
      <Card className="border-rose-200">
        <CardBody>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-900">อ่านไฟล์นี้ไม่สำเร็จ</p>
              <p className="mt-1 text-xs text-slate-600">
                {batch.errorMessage ?? 'ระบบอ่านไฟล์นี้ไม่ได้ ลองดาวน์โหลดไฟล์ใหม่จากแพลตฟอร์มแล้วอัปโหลดอีกครั้ง'}
              </p>
              <Link href="/imports/new" className={buttonClass('primary', 'sm', 'mt-3')}>
                อัปโหลดไฟล์ใหม่
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (batch.status === 'applied') {
    return (
      <Card className="border-emerald-200">
        <CardBody>
          <div className="flex items-start gap-3">
            <PackageCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-900">ไฟล์นี้ถูกบันทึกเข้าสต็อกแล้ว</p>
              <p className="mt-1 text-xs text-slate-600">
                บันทึกเมื่อ {batch.appliedAt ? formatDateTime(batch.appliedAt) : 'ไม่ทราบเวลา'} จำนวน{' '}
                {qty(batch.ordersParsed)} ออเดอร์ และ {qty(batch.linesParsed)} รายการสินค้า
                ข้อมูลจริงอยู่ที่หน้าออเดอร์และความเคลื่อนไหวสต็อก
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/movements" className={buttonClass('primary', 'sm')}>
                  ดูความเคลื่อนไหวสต็อก
                </Link>
                <Link href="/orders" className={buttonClass('outline', 'sm')}>
                  ดูออเดอร์
                </Link>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  // uploaded / parsing / applying, or a file that held no usable order row.
  return (
    <Card>
      <EmptyState
        title="ยังไม่มีข้อมูลให้ตรวจสอบ"
        description="ไฟล์นี้ยังไม่มีตัวอย่างข้อมูล อาจกำลังอ่านไฟล์อยู่ หรืออ่านแล้วไม่พบแถวออเดอร์ที่ใช้ได้"
        icon={<ClipboardList className="size-5" aria-hidden />}
      />
    </Card>
  );
}

/** Thai copy for the skip reasons the API reports. */
const SKIP_REASON_LABEL: Record<PreviewSkippedOrder['reason'], string> = {
  cancelled: 'ออเดอร์ถูกยกเลิกในไฟล์ จะไม่ตัดสต็อก (ถ้าเคยตัดไปแล้ว ระบบจะคืนสต็อกตามต้นทุนเดิม)',
  returned: 'ลูกค้าคืนสินค้า จะไม่ตัดสต็อก (ถ้าเคยตัดไปแล้ว ระบบจะคืนสต็อกตามต้นทุนเดิม)',
  already_imported: 'ออเดอร์นี้อยู่ในระบบแล้ว จะไม่ตัดสต็อกซ้ำ',
};

/** The ถูกข้าม bucket: orders the applier will not touch, each with a reason. */
function SkippedOrdersTable({ skipped }: { skipped: PreviewSkippedOrder[] }) {
  return (
    <TableWrap>
      <Table>
        <Thead>
          <Tr>
            <Th>เลขที่ออเดอร์</Th>
            <Th>สถานะในไฟล์</Th>
            <Th numeric>รายการ</Th>
            <Th numeric>ยอดรวม</Th>
            <Th>เหตุผลที่ข้าม</Th>
          </Tr>
        </Thead>
        <Tbody>
          {skipped.map(({ order, reason }) => (
            <Tr key={order.externalOrderId}>
              <Td className="font-mono text-xs text-slate-900">{order.externalOrderId}</Td>
              <Td>
                <OrderStatusBadge status={order.status} />
              </Td>
              <Td numeric>{qty(order.lines.length)}</Td>
              <Td numeric className="font-medium text-slate-900">
                {baht(order.grandTotal)}
              </Td>
              <Td className="text-xs text-slate-600">{SKIP_REASON_LABEL[reason]}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableWrap>
  );
}

/** 422 unmatched_sku is a normal outcome, not a crash. Explain the next step. */
function UnmatchedApplyError({ error }: { error: ApiError }) {
  const raw = error.details?.unmatched;
  const skus = Array.isArray(raw) ? raw.map((value) => String(value)) : [];

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
      <p className="text-sm font-medium text-rose-700">ยังยืนยันไม่ได้</p>
      <p className="mt-0.5 text-xs text-slate-600">{error.message}</p>
      {skus.length > 0 ? (
        <p className="mt-1 font-mono text-[11px] text-slate-500">{skus.join(', ')}</p>
      ) : null}
    </div>
  );
}

export function ImportPreview({ detail, onReload }: ImportPreviewProps) {
  const { hasPermission } = useRole();
  const { batch, orders, issues, unmatched } = detail;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSku, setPendingSku] = useState<string | null>(null);

  const match = useMutation((input: { platformSku: string; variantId: string }) =>
    api.matchImportSku(batch.id, input),
  );
  const apply = useMutation<void, ApplyImportResult>(() => api.applyImport(batch.id));

  // Only a batch waiting for confirmation offers match / apply. Applied and
  // failed batches fall through to their own status cards below.
  if (batch.status !== 'preview_ready') return <NoPreviewState detail={detail} />;
  const hasPreview = orders.length > 0 || issues.length > 0 || unmatched.length > 0;
  if (!hasPreview) return <NoPreviewState detail={detail} />;

  const { willDeduct, needsMatch, skipped } = detail.groups;
  const lineCount = orders.reduce((sum, order) => sum + order.lines.length, 0);
  const deductLines = willDeduct.reduce((sum, order) => sum + order.lines.length, 0);
  const unmatchedLines = orders.reduce(
    (sum, order) => sum + order.lines.filter((line) => line.matchSource === 'unmatched').length,
    0,
  );
  const canRun = hasPermission('import:run');
  const blocked = unmatched.length > 0;

  const handleMatch = async (platformSku: string, variantId: string) => {
    setPendingSku(platformSku);
    const saved = await match.run({ platformSku, variantId });
    setPendingSku(null);
    if (saved) onReload();
  };

  const handleApply = async () => {
    const applied = await apply.run(undefined);
    setConfirmOpen(false);
    if (applied) onReload();
  };

  if (apply.result) return <ApplyResultPanel result={apply.result} />;

  const disabledReason = blocked
    ? 'ต้องจับคู่ SKU ที่ค้างอยู่ให้ครบก่อน จึงจะยืนยันได้'
    : !canRun
      ? 'ตำแหน่งงานของคุณไม่มีสิทธิ์นำเข้าออเดอร์ (ต้องมีสิทธิ์ import:run)'
      : undefined;

  return (
    <div className="space-y-4 pb-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryStat label="ออเดอร์ทั้งหมด" value={orders.length} />
        <SummaryStat label="รายการสินค้า" value={lineCount} />
        <SummaryStat label="จะตัดสต็อก" value={willDeduct.length} tone="good" />
        <SummaryStat
          label="ยังไม่จับคู่"
          value={unmatchedLines}
          tone={unmatchedLines > 0 ? 'bad' : 'good'}
        />
        <SummaryStat
          label="ถูกข้าม / ปัญหา"
          value={skipped.length + issues.length}
          tone={skipped.length + issues.length > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {match.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
          จับคู่ไม่สำเร็จ: {match.error.message}
        </div>
      ) : null}

      {unmatched.length > 0 ? (
        <UnmatchedPanel items={unmatched} pendingSku={pendingSku} onMatch={handleMatch} />
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          <p className="text-xs text-slate-700">จับคู่สินค้าครบทุกรายการแล้ว พร้อมยืนยันนำเข้าและตัดสต็อก</p>
        </div>
      )}

      <Card>
        <CardHeader
          title="ตัดได้ - ออเดอร์ที่จะตัดสต็อกเมื่อยืนยัน"
          description="ทุกรายการจับคู่สินค้าแล้ว กดที่แถวเพื่อดูสินค้าในระบบที่จับคู่ไว้"
          action={
            batch.channelKind ? (
              <ChannelBadge kind={batch.channelKind} label={batch.channelName} />
            ) : batch.detectedKind ? (
              <ChannelBadge kind={batch.detectedKind} />
            ) : null
          }
        />
        {willDeduct.length === 0 ? (
          <EmptyState
            title="ไม่มีออเดอร์ที่จะตัดสต็อก"
            description="ออเดอร์ที่จะเข้าระบบจะปรากฏที่นี่เมื่อจับคู่ SKU ครบทุกรายการ"
          />
        ) : (
          <PreviewOrdersTable orders={willDeduct} />
        )}
      </Card>

      {needsMatch.length > 0 ? (
        <Card>
          <CardHeader
            title="ติดปัญหา SKU - รอการจับคู่"
            description="ออเดอร์กลุ่มนี้จะย้ายขึ้นไปที่ ตัดได้ เมื่อจับคู่ SKU ครบทุกรายการ"
          />
          <PreviewOrdersTable orders={needsMatch} />
        </Card>
      ) : null}

      {skipped.length > 0 ? (
        <Card>
          <CardHeader
            title="ถูกข้าม - จะไม่ตัดสต็อก"
            description="ออเดอร์ที่ถูกยกเลิกในไฟล์ หรือเคยนำเข้าแล้ว ระบบข้ามเพื่อไม่ให้ตัดสต็อกซ้ำ"
          />
          <SkippedOrdersTable skipped={skipped} />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="ปัญหาที่พบในไฟล์"
          description="แถวที่มีปัญหาจะไม่ทำให้ทั้งไฟล์ล้ม ระบบข้ามเฉพาะแถวนั้นและรายงานไว้ที่นี่"
        />
        <ParseIssuesList issues={issues} />
      </Card>

      {/* Sticky inside the scrolling <main>, so it never covers the sidebar. */}
      <div className="sticky bottom-3 z-30 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-700">
              ตัดได้ {qty(willDeduct.length)} ออเดอร์ ({qty(deductLines)} รายการ)
              {skipped.length > 0 ? <> / ข้าม {qty(skipped.length)} ออเดอร์</> : null}
            </p>
            <p className="text-xs text-slate-500">
              <ImportStatusBadge status={batch.status} />{' '}
              <span className="ml-1">ยังไม่มีการตัดสต็อกจนกว่าจะกดยืนยัน</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {apply.error ? (
              apply.error.code === 'unmatched_sku' ? (
                <UnmatchedApplyError error={apply.error} />
              ) : (
                <span className="text-xs text-rose-600">{apply.error.message}</span>
              )
            ) : null}
            <span title={disabledReason}>
              <Button
                size="lg"
                data-tour-id="apply-button"
                loading={apply.pending}
                disabled={blocked || !canRun}
                onClick={() => setConfirmOpen(true)}
              >
                ยืนยันนำเข้าและตัดสต็อก
              </Button>
            </span>
          </div>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="ยืนยันนำเข้าและตัดสต็อก"
        description="ตรวจสอบตัวเลขอีกครั้งก่อนบันทึก"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              ยกเลิก
            </Button>
            <Button loading={apply.pending} onClick={handleApply}>
              ยืนยัน
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            ระบบจะตัดสต็อก {qty(willDeduct.length)} ออเดอร์ รวม {qty(deductLines)} รายการ
            จากคลังกลางด้วยวิธีต้นทุนแบบเข้าก่อนออกก่อน (FIFO)
          </p>
          {skipped.length > 0 ? (
            <p>ข้าม {qty(skipped.length)} ออเดอร์ที่ถูกยกเลิกหรือเคยนำเข้าแล้ว - กลุ่มนี้จะไม่ถูกตัดสต็อก</p>
          ) : null}
          <p className="text-xs text-slate-500">
            ถ้าอัปโหลดไฟล์เดิมซ้ำ ระบบจะไม่ตัดสต็อกซ้ำ เพราะใช้เลขที่ออเดอร์ของแพลตฟอร์มเป็นตัวกันซ้ำ
          </p>
        </div>
      </Dialog>
    </div>
  );
}
