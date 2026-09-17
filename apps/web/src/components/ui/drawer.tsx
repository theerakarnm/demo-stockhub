'use client';

/**
 * Overlay primitives built on the native <dialog> element.
 *
 * Why native instead of a div with role="dialog": showModal() gives real focus
 * trapping, Escape handling and top-layer stacking. A div can only claim those
 * behaviours in ARIA while not actually doing them, which is worse than no role
 * at all for a keyboard or screen reader user.
 *
 * The UA stylesheet gives <dialog> a border, padding, margin and fit-content
 * size, so every instance resets them with RESET_DIALOG.
 */

import { cn } from '@/lib/cn';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Cancels the UA dialog styling so Tailwind layout classes behave normally. */
const RESET_DIALOG = 'm-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0';

/**
 * Promote the dialog to a modal and lock background scroll.
 *
 * Scroll locking is still manual: the top layer stops clicks, not wheel events.
 */
const useModalDialog = (open: boolean) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !open) return;
    if (!node.open) node.showModal();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (node.open) node.close();
    };
  }, [open]);

  return ref;
};

/**
 * Escape fires `cancel`. Prevent the default close so React state stays the
 * single source of truth, then let the parent unmount us.
 */
const cancelHandler = (onClose: () => void) => (event: React.SyntheticEvent<HTMLDialogElement>) => {
  event.preventDefault();
  onClose();
};

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="ปิด"
      onClick={onClose}
      className="absolute inset-0 size-full cursor-default bg-slate-900/40"
    />
  );
}

function Header({
  title,
  description,
  onClose,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Right-hand side panel. Used for the inventory quick view. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: OverlayProps) {
  const ref = useModalDialog(open);
  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onCancel={cancelHandler(onClose)}
      className={cn('fixed inset-0', RESET_DIALOG)}
    >
      <Backdrop onClose={onClose} />
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl',
          className,
        )}
      >
        <Header title={title} description={description} onClose={onClose} />
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="border-t border-slate-200 px-5 py-3">{footer}</div> : null}
      </div>
    </dialog>
  );
}

/** Centred modal. Used for confirmations such as "ยืนยันการนำเข้า". */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: OverlayProps) {
  const ref = useModalDialog(open);
  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onCancel={cancelHandler(onClose)}
      className={cn('fixed inset-0 flex items-center justify-center p-4', RESET_DIALOG)}
    >
      <Backdrop onClose={onClose} />
      <div
        className={cn(
          'relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl',
          className,
        )}
      >
        <Header title={title} description={description} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </dialog>
  );
}
