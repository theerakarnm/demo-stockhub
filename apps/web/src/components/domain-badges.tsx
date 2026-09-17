/**
 * Enum -> chip. One file so a new enum value is obvious to wire up.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
  CHANNEL_KIND_CLASSES,
  CHANNEL_KIND_LABELS,
  IMPORT_STATUS_LABELS,
  IMPORT_STATUS_TONES,
  MATCH_SOURCE_LABELS,
  MATCH_SOURCE_TONES,
  MOVEMENT_REASON_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
} from '@/lib/labels';
import type {
  ChannelKind,
  ImportStatus,
  MatchSource,
  MovementReason,
  OrderStatus,
} from '@stockhub/core';
import { isInbound } from '@stockhub/core';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export function ChannelBadge({ kind, label }: { kind: ChannelKind; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        CHANNEL_KIND_CLASSES[kind],
      )}
    >
      {label ?? CHANNEL_KIND_LABELS[kind]}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_STATUS_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return <Badge tone={IMPORT_STATUS_TONES[status]}>{IMPORT_STATUS_LABELS[status]}</Badge>;
}

export function MatchSourceBadge({ source }: { source: MatchSource }) {
  return <Badge tone={MATCH_SOURCE_TONES[source]}>{MATCH_SOURCE_LABELS[source]}</Badge>;
}

/**
 * Movement reason chip. Colour follows direction, because "did stock go in or
 * out" is the question a warehouse user asks first.
 */
export function MovementReasonBadge({ reason }: { reason: MovementReason }) {
  const inbound = isInbound(reason);
  return (
    <Badge tone={inbound ? 'success' : 'danger'}>
      {inbound ? (
        <ArrowDownLeft className="size-3" aria-hidden />
      ) : (
        <ArrowUpRight className="size-3" aria-hidden />
      )}
      {MOVEMENT_REASON_LABELS[reason]}
    </Badge>
  );
}

/** Signed quantity, green for inbound and red for outbound. */
export function QtyDelta({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-slate-500',
        className,
      )}
    >
      {value > 0 ? '+' : ''}
      {value.toLocaleString('th-TH')}
    </span>
  );
}
