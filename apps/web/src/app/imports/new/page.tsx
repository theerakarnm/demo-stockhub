'use client';

/**
 * The upload flow. This is the screen the whole pitch hangs on, so it is built
 * as a visible four step process: channel, file, what we read, what we will do.
 *
 * The page performs exactly one write (api.createImport). Applying the batch is
 * owned by <ImportPreview>, which is shared with /imports/[id].
 */

import { DetectionCard } from '@/components/imports/detection-card';
import { ImportDropzone } from '@/components/imports/import-dropzone';
import { ImportPreview } from '@/components/imports/import-preview';
import { ImportStepper, StepPanel } from '@/components/imports/import-stepper';
import type { ImportStep } from '@/components/imports/import-stepper';
import { SampleFileButtons } from '@/components/imports/sample-file-button';
import { useRole } from '@/components/role-provider';
import { Button, CardSkeleton, ErrorState, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ImportBatch } from '@/lib/api-types';
import { useApi, useMutation } from '@/lib/use-api';
import { IMPORTABLE_CHANNEL_KINDS } from '@stockhub/core';
import { AlertTriangle, ArrowLeft, RotateCcw, ScanSearch } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const STEPS: ImportStep[] = [
  { id: 1, title: 'เลือกช่องทางขาย', hint: 'ไม่บังคับ' },
  { id: 2, title: 'เลือกไฟล์', hint: 'ลากมาวางหรือเลือกจากเครื่อง' },
  { id: 3, title: 'ตรวจผลการอ่านไฟล์', hint: 'ระบบตรวจจับแพลตฟอร์ม' },
  { id: 4, title: 'ตรวจสอบก่อนยืนยัน', hint: 'ยังไม่ตัดสต็อกจนกว่าจะยืนยัน' },
];

const IMPORTABLE = new Set<string>(IMPORTABLE_CHANNEL_KINDS);

export default function NewImportPage() {
  const { role } = useRole();
  const [channelId, setChannelId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);

  const channelsQuery = useApi(() => api.getChannels(), [role]);
  const upload = useMutation((input: { file: File; channelId?: string }) =>
    api.createImport(input),
  );

  // Only fetch the preview once a batch exists; useApi has no "skip" flag, so
  // the fetcher resolves to null instead.
  const batchId = batch?.id ?? null;
  const detailQuery = useApi(
    async () => (batchId ? await api.getImport(batchId) : null),
    [batchId, role],
  );

  const channelOptions = (channelsQuery.data ?? [])
    .filter((channel) => IMPORTABLE.has(channel.kind) && channel.isActive)
    .map((channel) => ({ value: channel.id, label: channel.name }));

  // Step 3 opens the moment the batch exists, step 4 once the preview arrives.
  const currentStep = !file ? 1 : !batch ? 2 : detailQuery.data ? 4 : 3;

  const handleUpload = async () => {
    if (!file) return;
    const created = await upload.run({ file, channelId: channelId === '' ? undefined : channelId });
    if (created) setBatch(created);
  };

  const handleReset = () => {
    setFile(null);
    setBatch(null);
    upload.reset();
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/imports" className="inline-flex items-center gap-1 hover:text-slate-700">
            <ArrowLeft className="size-3.5" aria-hidden />
            กลับไปหน้านำเข้าออเดอร์
          </Link>
        }
        title="อัปโหลดไฟล์ออเดอร์"
        description="ไฟล์จากทุกแพลตฟอร์มเข้าคลังกลางเดียวกัน ตัดสต็อกเมื่อคุณกดยืนยันเท่านั้น"
        actions={
          batch ? (
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="size-4" aria-hidden />
              อัปโหลดไฟล์ใหม่
            </Button>
          ) : null
        }
      />

      <ImportStepper steps={STEPS} current={currentStep} />

      <div className="space-y-4">
        <StepPanel
          step={1}
          title="เลือกช่องทางขาย"
          description="ไม่บังคับ ระบบอ่านหัวคอลัมน์ในไฟล์แล้วเดาแพลตฟอร์มให้เองได้"
        >
          {channelsQuery.error ? (
            <ErrorState error={channelsQuery.error} onRetry={channelsQuery.reload} />
          ) : channelsQuery.loading && channelOptions.length === 0 ? (
            <CardSkeleton />
          ) : (
            <div className="max-w-md">
              <Select
                label="ร้านค้า / ช่องทาง"
                placeholder="ตรวจจับอัตโนมัติจากไฟล์"
                options={channelOptions}
                value={channelId}
                disabled={batch !== null}
                onChange={(event) => setChannelId(event.target.value)}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                เลือกเมื่อคุณมีหลายร้านในแพลตฟอร์มเดียวกัน เพื่อให้ออเดอร์ไปอยู่ถูกร้าน
              </p>
            </div>
          )}
        </StepPanel>

        <StepPanel
          step={2}
          title="เลือกไฟล์"
          description="รองรับไฟล์ที่ดาวน์โหลดมาจากหลังร้านโดยตรง ไม่ต้องแก้ไฟล์ก่อน"
        >
          <ImportDropzone
            file={file}
            onPick={(picked) => {
              setFile(picked);
              upload.reset();
            }}
            onClear={handleReset}
            disabled={upload.pending || batch !== null}
          />

          <SampleFileButtons
            disabled={upload.pending || batch !== null}
            onPick={(picked, pinnedChannelId) => {
              // The channel is pinned: getChannelByKind resolves limit(1)
              // without an order, so the walkthrough cannot rely on detection
              // with two live channels per marketplace in the seed.
              setChannelId(pinnedChannelId);
              setFile(picked);
              upload.reset();
            }}
          />

          {upload.error ? (
            <div className="mt-3">
              <ErrorState error={upload.error} onRetry={handleUpload} />
            </div>
          ) : null}

          {file && !batch ? (
            <div className="mt-3 flex justify-end">
              <Button size="lg" loading={upload.pending} onClick={handleUpload}>
                <ScanSearch className="size-4" aria-hidden />
                อ่านไฟล์และดูตัวอย่าง
              </Button>
            </div>
          ) : null}
        </StepPanel>

        <StepPanel
          step={3}
          title="ตรวจผลการอ่านไฟล์"
          description="ระบบบอกว่าอ่านไฟล์นี้เป็นแพลตฟอร์มไหน และอ่านได้กี่แถว"
          muted={!batch}
        >
          {batch ? (
            <>
              <DetectionCard batch={batch} />
              {detailQuery.data?.issues.some((issue) => issue.code === 'duplicate_checksum') ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  <p className="text-xs text-amber-800">
                    ไฟล์นี้เคยถูกนำเข้าแล้ว (ตรวจจากลายนิ้วมือไฟล์) ออเดอร์ที่เคยบันทึกไว้จะถูกข้าม และจะไม่ตัดสต็อกซ้ำ
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-slate-500">
              ยังไม่มีผลการอ่านไฟล์ เลือกไฟล์ในขั้นตอนที่ 2 แล้วกด อ่านไฟล์และดูตัวอย่าง
            </p>
          )}
        </StepPanel>

        <StepPanel
          step={4}
          title="ตรวจสอบก่อนยืนยัน"
          description="ดูออเดอร์ที่จะเข้า จับคู่ SKU ที่ค้าง แล้วจึงยืนยันตัดสต็อก"
          muted={!detailQuery.data}
        >
          {!batch ? (
            <p className="text-xs text-slate-500">ขั้นตอนนี้จะเปิดให้ตรวจสอบหลังระบบอ่านไฟล์เสร็จ</p>
          ) : detailQuery.error ? (
            <ErrorState error={detailQuery.error} onRetry={detailQuery.reload} />
          ) : detailQuery.loading && !detailQuery.data ? (
            <CardSkeleton />
          ) : detailQuery.data ? (
            <ImportPreview detail={detailQuery.data} onReload={detailQuery.reload} />
          ) : null}
        </StepPanel>
      </div>
    </>
  );
}
