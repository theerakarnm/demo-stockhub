'use client';

/**
 * Confirm dialog for cancelling a bill.
 *
 * Cancel is a stock action, not just a status flip: the API restores the exact
 * FIFO slices the sale consumed (reason cancel_restore), so on-hand goes back
 * up. The copy says so, because a till user otherwise reads "ยกเลิก" as
 * paperwork only.
 */

import { Button, Dialog, Input } from '@/components/ui';
import type { ApiError } from '@/lib/api-error';
import { useState } from 'react';

interface CancelOrderDialogProps {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  error: ApiError | null;
  /** Called with the reason typed by the user once they confirm. */
  onConfirm: (reason: string) => void;
}

/** The API rejects reasons under 3 characters; the button mirrors that here. */
const MIN_REASON = 3;

export function CancelOrderDialog({
  open,
  onClose,
  pending,
  error,
  onConfirm,
}: CancelOrderDialogProps) {
  const [reason, setReason] = useState('');
  const ready = reason.trim().length >= MIN_REASON;

  const close = (): void => {
    setReason('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="ยืนยันการยกเลิกบิล"
      description="การยกเลิกไม่สามารถทำย้อนกลับได้"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            ปิด
          </Button>
          <Button
            variant="danger"
            loading={pending}
            disabled={!ready}
            onClick={() => onConfirm(reason.trim())}
          >
            ยกเลิกบิล
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>ระบบจะเปลี่ยนสถานะบิลเป็น "ยกเลิก" และคืนสต็อกทุกรายการเข้าคลังกลางที่ต้นทุนเดิมของล็อตที่เคยตัดไป</p>
        <Input
          label="เหตุผลที่ยกเลิก (บันทึกลงประวัติสต็อก)"
          name="cancelReason"
          placeholder="เช่น ลูกค้าเปลี่ยนใจ / ออกบิลผิด"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error.message}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
