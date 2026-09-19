'use client';

/**
 * The card that pops after every write step: what the action did, what changed
 * (before -> after, always two live reads, never hardcoded), where the data
 * went, and which screen to jump to in order to see it.
 */

import type { TourStep } from './tour-steps';
import type { StepSnapshot } from './use-tour-step';

const baht = (satang: number | undefined): string =>
  satang === undefined ? '-' : (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 });

const delta = (label: string, before: number | undefined, after: number | undefined): string => {
  if (before === undefined || after === undefined || before === after) {
    return `${label} ${baht(after ?? before)}`;
  }
  return `${label} ${baht(before)} -> ${baht(after)}`;
};

export function DataFlowCard({
  step,
  before,
  after,
  onJump,
}: {
  step: TourStep;
  before: StepSnapshot | null;
  after: StepSnapshot | null;
  onJump: (href: string) => void;
}) {
  const hasNumbers = before !== null || after !== null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm print:hidden">
      <p className="mb-1 font-semibold text-emerald-800">ผลของ action นี้</p>
      <dl className="space-y-1 text-slate-700">
        <div>
          <dt className="inline font-medium">ทำอะไร: </dt>
          <dd className="inline">{step.writes}</dd>
        </div>
        {hasNumbers ? (
          <div>
            <dt className="inline font-medium">เห็นอะไร: </dt>
            <dd className="inline">
              {delta('ของรวม', before?.totalOnHand, after?.totalOnHand)}
              {after?.stockValue !== undefined || before?.stockValue !== undefined
                ? ` | ${delta('มูลค่าสต็อก', before?.stockValue, after?.stockValue)} บาท`
                : ''}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="inline font-medium">ข้อมูลวิ่งไปไหน: </dt>
          <dd className="inline">
            {step.tables.length > 0 ? step.tables.join(', ') : 'ไม่มีการเขียนข้อมูล'}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">ไปดูต่อที่: </dt>
          <dd className="inline space-x-2">
            {step.affected.map((link) => (
              <button
                key={link.href}
                type="button"
                className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                onClick={() => onJump(link.href)}
              >
                {link.label}
              </button>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}
