'use client';

/**
 * A single import batch. Same preview component as /imports/new step 4, so a
 * batch that was left half-done can be finished later without re-uploading.
 */

import { ChannelBadge, ImportStatusBadge } from '@/components/domain-badges';
import { ImportPreview } from '@/components/imports/import-preview';
import { useRole } from '@/components/role-provider';
import { Button, Card, CardSkeleton, ErrorState, PageHeader, TableSkeleton } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ImportBatch } from '@/lib/api-types';
import { formatBytes, formatDateTime, qty } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

function BatchHeader({ batch }: { batch: ImportBatch }) {
  const kind = batch.channelKind ?? batch.detectedKind;

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{batch.fileName}</p>
          <p className="text-xs text-slate-500">{formatBytes(batch.fileSize)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">ช่องทาง</p>
          <div className="mt-0.5">
            {kind ? (
              <ChannelBadge kind={kind} label={batch.channelName} />
            ) : (
              <span className="text-xs text-slate-400">ไม่ทราบช่องทาง</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500">สถานะ</p>
          <div className="mt-0.5">
            <ImportStatusBadge status={batch.status} />
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500">อัปโหลดเมื่อ</p>
          <p className="mt-0.5 text-sm text-slate-700">{formatDateTime(batch.uploadedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">ผู้อัปโหลด</p>
          <p className="mt-0.5 text-sm text-slate-700">{batch.uploadedByName ?? '-'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">อ่านได้</p>
          <p className="mt-0.5 text-sm text-slate-700">
            {qty(batch.rowsRead)} แถว / {qty(batch.ordersParsed)} ออเดอร์ / {qty(batch.linesParsed)}{' '}
            รายการ
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function ImportDetailPage() {
  const { role } = useRole();
  // Client component: read the route param with useParams, not with props.
  // useParams is typed as nullable in some Next releases, so read it defensively.
  const params = useParams<{ id: string }>();
  const importId = params?.id ?? '';

  const { data, error, loading, reload } = useApi(() => api.getImport(importId), [importId, role]);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/imports" className="inline-flex items-center gap-1 hover:text-slate-700">
            <ArrowLeft className="size-3.5" aria-hidden />
            กลับไปหน้านำเข้าออเดอร์
          </Link>
        }
        title="ตรวจสอบไฟล์นำเข้า"
        description="ดูออเดอร์ที่จะเข้าระบบ จับคู่ SKU ที่ค้าง แล้วยืนยันเพื่อตัดสต็อก"
        actions={
          <Button variant="outline" onClick={reload} loading={loading && data !== null}>
            <RefreshCw className="size-4" aria-hidden />
            รีเฟรช
          </Button>
        }
      />

      {loading && !data ? (
        <div className="space-y-4">
          <CardSkeleton />
          <Card>
            <TableSkeleton rows={6} cols={6} />
          </Card>
        </div>
      ) : null}

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : null}

      {data && !error ? (
        <>
          <BatchHeader batch={data.batch} />
          <ImportPreview detail={data} onReload={reload} />
        </>
      ) : null}
    </>
  );
}
