'use client';

/**
 * Create / edit form for one customer, rendered inside the /customers drawer.
 *
 * The tier <Select> is hidden for roles without `price_tier:read`: the server
 * rejects the field for them anyway, so the form never sends a value the
 * caller cannot see.
 */

import { useRole } from '@/components/role-provider';
import { Button, ErrorState, Input, Select, Skeleton } from '@/components/ui';
import { customersApi, pricingApi } from '@/lib/api-pricing';
import type { CustomerInput, CustomerView } from '@/lib/api-types-pricing';
import { useApi, useMutation } from '@/lib/use-api';
import { useCallback, useState } from 'react';

export interface CustomerFormProps {
  /** When set the form edits this customer; otherwise it creates a new one. */
  customer: CustomerView | null;
  onSaved: (customer: CustomerView) => void;
  onCancel: () => void;
}

interface FormState {
  name: string;
  phone: string;
  email: string;
  priceTierId: string;
  note: string;
  isActive: boolean;
}

const emptyForm = (): FormState => ({
  name: '',
  phone: '',
  email: '',
  priceTierId: '',
  note: '',
  isActive: true,
});

const formOf = (customer: CustomerView): FormState => ({
  name: customer.name,
  phone: customer.phone ?? '',
  email: customer.email ?? '',
  priceTierId: customer.priceTierId ?? '',
  note: customer.note ?? '',
  isActive: customer.isActive,
});

/** Client-side mirror of the API zod rules, so the common typos never round-trip. */
const validate = (form: FormState): string | null => {
  if (form.name.trim().length === 0) return 'กรุณากรอกชื่อลูกค้า';
  if (form.name.trim().length > 160) return 'ชื่อลูกค้ายาวเกิน 160 ตัวอักษร';
  if (form.phone.trim().length > 32) return 'เบอร์โทรศัพท์ยาวเกิน 32 ตัวอักษร';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return 'รูปแบบอีเมลไม่ถูกต้อง';
  }
  return null;
};

export function CustomerForm({ customer, onSaved, onCancel }: CustomerFormProps) {
  const { role, hasPermission } = useRole();
  const canReadTiers = hasPermission('price_tier:read');

  const tiers = useApi(() => pricingApi.listTiers(), [role]);
  const [form, setForm] = useState<FormState>(customer ? formOf(customer) : emptyForm());
  const [formError, setFormError] = useState('');

  const save = useMutation((input: CustomerInput) =>
    customer ? customersApi.update(customer.id, input) : customersApi.create(input),
  );

  const patchForm = useCallback((patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const submit = useCallback(() => {
    const problem = validate(form);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError('');
    // Empty strings stay absent on the wire: PATCH keeps the stored value then.
    void save
      .run({
        name: form.name.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
        ...(canReadTiers && form.priceTierId !== ''
          ? { priceTierId: form.priceTierId || null }
          : {}),
        isActive: form.isActive,
      })
      .then((saved) => {
        if (saved) onSaved(saved);
      });
  }, [form, save, canReadTiers, onSaved]);

  if (canReadTiers && tiers.error) {
    return <ErrorState error={tiers.error} onRetry={tiers.reload} />;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        label="ชื่อลูกค้า"
        name="name"
        value={form.name}
        onChange={(event) => patchForm({ name: event.target.value })}
        placeholder="เช่น ร้านสวนเกษตรดี"
        required
      />

      <Input
        label="โทรศัพท์"
        name="phone"
        type="tel"
        value={form.phone}
        onChange={(event) => patchForm({ phone: event.target.value })}
        placeholder="08xxxxxxxx"
      />

      <Input
        label="อีเมล"
        name="email"
        type="email"
        value={form.email}
        onChange={(event) => patchForm({ email: event.target.value })}
        placeholder="name@example.com"
      />

      {canReadTiers ? (
        tiers.loading && !tiers.data ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <Select
            label="ระดับราคา"
            name="priceTierId"
            value={form.priceTierId}
            onChange={(event) => patchForm({ priceTierId: event.target.value })}
            placeholder="ราคาปลีก (ค่าเริ่มต้น)"
            options={(tiers.data ?? []).map((tier) => ({ value: tier.id, label: tier.name }))}
          />
        )
      ) : null}

      <Input
        label="โน้ต"
        name="note"
        value={form.note}
        onChange={(event) => patchForm({ note: event.target.value })}
        placeholder="รายละเอียดเพิ่มเติม เช่น ที่อยู่จัดส่งประจำ"
      />

      <Select
        label="สถานะ"
        name="isActive"
        value={form.isActive ? 'active' : 'inactive'}
        onChange={(event) => patchForm({ isActive: event.target.value === 'active' })}
        options={[
          { value: 'active', label: 'เปิดใช้งาน' },
          { value: 'inactive', label: 'ปิดใช้งาน' },
        ]}
      />

      {formError || save.error ? (
        <p className="text-sm text-red-600" role="alert">
          {formError || save.error?.message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </div>
    </form>
  );
}
