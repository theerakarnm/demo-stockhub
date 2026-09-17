'use client';

/**
 * Drag and drop target for a marketplace order export.
 *
 * The component owns no upload logic: it hands the picked File to the page,
 * which is the only place allowed to call api.createImport().
 */

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { FileSpreadsheet, Sparkles, UploadCloud, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

/** Marketplace exports are CSV or Excel. Anything else is rejected by the API. */
const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls';

export interface ImportDropzoneProps {
  file: File | null;
  onPick: (file: File) => void;
  onClear: () => void;
  /** Demo-only shortcut, see the note rendered next to the button. */
  onUseSample: () => void;
  disabled?: boolean;
}

export function ImportDropzone({
  file,
  onPick,
  onClear,
  onUseSample,
  disabled = false,
}: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (disabled) return;
    // noUncheckedIndexedAccess: the list can be empty even on a real drop.
    const dropped = event.dataTransfer.files[0];
    if (dropped) onPick(dropped);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (picked) onPick(picked);
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
  };

  if (file) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileSpreadsheet className="size-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
          <X className="size-3.5" aria-hidden />
          เอาไฟล์ออก
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragActive
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-slate-300 bg-slate-50/60 hover:border-slate-400',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <UploadCloud
          className={cn('mb-2 size-7', dragActive ? 'text-emerald-600' : 'text-slate-400')}
          aria-hidden
        />
        <p className="text-sm font-medium text-slate-900">ลากไฟล์ออเดอร์มาวางที่นี่</p>
        <p className="mt-1 text-xs text-slate-500">
          รองรับไฟล์ .csv .xlsx และ .xls ที่ดาวน์โหลดจาก Shopee, Lazada หรือ TikTok Shop
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={handleInputChange}
        />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            เลือกไฟล์จากเครื่อง
          </Button>
          {/* Demo only: this button disappears once mock mode is turned off. */}
          <Button variant="ghost" size="sm" onClick={onUseSample}>
            <Sparkles className="size-3.5" aria-hidden />
            ใช้ไฟล์ตัวอย่าง
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        ไฟล์ตัวอย่างเป็นไฟล์เดโมของ Shopee ไว้ให้ลองดูขั้นตอนทั้งหมดโดยไม่ต้องหาไฟล์จริง
      </p>
    </div>
  );
}
