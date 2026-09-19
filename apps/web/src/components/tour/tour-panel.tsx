'use client';

/**
 * The right-hand walkthrough panel: the third column of the app shell.
 *
 * First open shows the start card - the guidance the demo promises, visible
 * without reading anything. After that the panel follows the active step:
 * plain-Thai narration, a ทำเสร็จแล้ว button that captures a live dashboard
 * read for the data-flow card (before arriving / after finishing, never
 * hardcoded), and the tour controls. Panel and provider mount only when
 * NEXT_PUBLIC_GUIDED_DEMO is on; print:hidden keeps the tour off the printed
 * bill (scene 14).
 *
 * The panel never edits page DOM; it only reads snapshots and navigates.
 */

import { Button } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { DashboardSummary } from '@/lib/api-types';
import { DEMO_MODE } from '@/lib/config';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DataFlowCard } from './data-flow-card';
import { ResetDemoButton } from './reset-demo-button';
import { useTour } from './tour-provider';
import { TourSpotlight } from './tour-spotlight';
import { TOUR_STEPS, stepPathFor } from './tour-steps';
import { useStepSnapshot } from './use-tour-step';

/** Steps that only read: no before/after capture, no ทำเสร็จแล้ว button. */
const READ_ONLY_STEPS = new Set([1, 5, 11, 13, 14, 17, 18, 19]);

/** Path without the query string. `[0]` on split is `string | undefined` under noUncheckedIndexedAccess. */
const basePathOf = (path: string): string => path.split('?')[0] ?? path;

export function TourPanel() {
  const tour = useTour();
  const router = useRouter();
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const snapshot = useStepSnapshot();

  const state = tour?.state;
  const step = state ? TOUR_STEPS.find((entry) => entry.step === state.currentStep) : undefined;
  const path = state && step ? stepPathFor(step, state.refs) : '/';
  const offPath = step !== undefined && !window.location.pathname.startsWith(basePathOf(path));

  // Follow the tour: when the active step changes, go to its page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect must fire on the active step only - refs and snapshots change far more often and must not re-trigger navigation.
  useEffect(() => {
    if (!state || step === undefined) return;
    const target = stepPathFor(step, state.refs);
    if (!window.location.pathname.startsWith(basePathOf(target))) {
      router.push(target);
    }
    // Capture the "before" read for write steps.
    if (!READ_ONLY_STEPS.has(step.step)) void snapshot.captureBefore();
  }, [state?.currentStep]);

  const markDone = useCallback(async () => {
    if (!tour || !step) return;
    if (!READ_ONLY_STEPS.has(step.step)) await snapshot.captureAfter();
    tour.complete(step.step);
  }, [tour, step, snapshot]);

  const showRawJson = useCallback(async () => {
    try {
      const summary: DashboardSummary = await api.getDashboardSummary();
      setRawJson(JSON.stringify(summary, null, 2));
    } catch (error) {
      setRawJson(String(error));
    }
  }, []);

  if (!tour || !state) return null;

  if (state.dismissed) {
    return (
      <button
        type="button"
        onClick={tour.reopen}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg print:hidden"
      >
        เปิดทัวร์ ({state.completedSteps.length}/{TOUR_STEPS.length})
      </button>
    );
  }

  if (state.currentStep === 0 || !step) {
    // First open: the start card IS the guidance the demo promises.
    return (
      <aside
        data-tour-id="tour-panel"
        className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-4 print:hidden"
      >
        {DEMO_MODE ? (
          <p className="rounded-lg bg-red-100 p-2 text-xs font-medium text-red-800">
            กำลังใช้ข้อมูลจำลอง ตัวเลขไม่ใช่ของจริง ตั้ง NEXT_PUBLIC_DEMO_MODE=false แล้วเปิดใหม่
          </p>
        ) : null}
        <div>
          <h2 className="text-base font-semibold text-slate-900">เริ่มทัวร์ 15 นาที</h2>
          <p className="mt-2 text-sm text-slate-600">
            เดินร้านเกษตรรุ่งเรืองหนึ่งวันทำงาน: รับของ นำเข้าออเดอร์ 3 แพลตฟอร์ม ขายส่ง ยกเลิก ดูกำไร
            แล้วสลับมุมมองพนักงาน ทุกขั้นมีปุ่มช่วยกรอกให้ ไม่ต้องเตรียมไฟล์เอง
          </p>
        </div>
        <Button
          data-tour-id="tour-start"
          onClick={() => {
            tour.next();
          }}
        >
          เริ่มทัวร์ 15 นาที
        </Button>
        <button
          type="button"
          onClick={tour.dismiss}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ข้ามทัวร์
        </button>
      </aside>
    );
  }

  return (
    <>
      <TourSpotlight targetId={step.targetId} />
      <aside
        data-tour-id="tour-panel"
        className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-4 print:hidden"
      >
        {DEMO_MODE ? (
          <p className="rounded-lg bg-red-100 p-2 text-xs font-medium text-red-800">
            กำลังใช้ข้อมูลจำลอง ตัวเลขไม่ใช่ของจริง ตั้ง NEXT_PUBLIC_DEMO_MODE=false แล้วเปิดใหม่
          </p>
        ) : null}

        <div>
          <p className="text-xs font-medium text-slate-500">
            ขั้นที่ {step.step} จาก {TOUR_STEPS.length}
          </p>
          <div className="mt-1 h-1.5 w-full rounded bg-slate-200">
            <div
              className="h-1.5 rounded bg-emerald-600"
              style={{
                width: `${Math.round((state.completedSteps.length / TOUR_STEPS.length) * 100)}%`,
              }}
            />
          </div>
        </div>

        {offPath ? (
          <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            ขั้นที่ {step.step} อยู่ที่หน้า {path}
            <button
              type="button"
              className="ml-2 font-semibold text-amber-900 underline underline-offset-2"
              onClick={() => router.push(path)}
            >
              ไปหน้านั้น
            </button>
          </div>
        ) : null}

        <div>
          <h2 className="text-base font-semibold text-slate-900">{step.title}</h2>
          <p className="mt-1 text-sm font-medium text-slate-800">{step.action}</p>
          <p className="mt-2 text-sm text-slate-600">{step.narration}</p>
        </div>

        {step.sample?.kind === 'receive' ? (
          <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
            <p className="font-medium">ค่าที่ปุ่ม &quot;กรอกค่าตัวอย่าง&quot; จะใส่ให้</p>
            <p className="mt-1">
              {step.sample.sku} / {step.sample.qty} /{' '}
              {step.sample.unitCostBaht.toLocaleString('th-TH')} / {step.sample.receivedAt} /{' '}
              {step.sample.reference}
            </p>
          </div>
        ) : null}
        {step.sample?.kind === 'sample-file' ? (
          <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
            ไฟล์ตัวอย่าง: {step.sample.file} (ช่องทางถูกเลือกให้แล้ว)
          </div>
        ) : null}

        {step.step === 19 ? (
          <div>
            <button
              type="button"
              data-tour-id="raw-json-button"
              onClick={() => void showRawJson()}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              ดู JSON ดิบ
            </button>
            {rawJson ? (
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-2 text-xs text-emerald-300">
                {rawJson}
              </pre>
            ) : null}
          </div>
        ) : null}

        {snapshot.after ? (
          <DataFlowCard
            step={step}
            before={snapshot.before}
            after={snapshot.after}
            onJump={(href) => router.push(href)}
          />
        ) : null}

        <div className="mt-auto space-y-2">
          {!READ_ONLY_STEPS.has(step.step) ? (
            <Button className="w-full" onClick={() => void markDone()}>
              ฉันทำแล้ว ✓
            </Button>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={tour.prev}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              ย้อน
            </button>
            <button
              type="button"
              onClick={tour.next}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              ถัดไป
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={tour.dismiss}
              className="flex-1 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              ข้ามทัวร์
            </button>
            <div className="flex-1">
              <ResetDemoButton onReset={tour.reset} />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
