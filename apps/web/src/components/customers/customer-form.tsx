'use client';

/**
 * Create / edit form for one customer, shown inside the customers drawer.
 *
 * The tier picker loads its options from pricingApi.listTiers() once per open;
 * leaving it on the placeholder means "no tier", which the API reads as
 * "price at the default tier". An explicit empty selection on edit sends
 * priceTierId: null, which is how PATCH clears the column.
 */

import { useRole } from '@/components/role-provider';
import { Button, Input, Select, fieldClass } from '@/components/ui';
import { customersApi, pricingApi } from '@/lib/api-pricing';
import type { CustomerInput, CustomerView } from '@/lib/api-types-pricing';
import { useApi, useMutation } from '@/lib/use-api';
import { useEffect, useState } from 'react';

interface CustomerFormProps {
  /** When set the form edits this customer; otherwise it creates a new one. */
  customer: CustomerView | null;
  onSaved: () => void;
  onCancel: () => void;
}

interface FormState {
  name: string;
  phone: string;
  email: string;
  tierId: string;
  note: string;
}

const toFormState = (customer: CustomerView | null): FormState => ({
  name: customer?.name ?? '',
  phone: customer?.phone ?? '',
  email: customer?.email ?? '',
  tierId: customer?.priceTierId ?? '',
  note: customer?.note ?? '',
});

export function CustomerForm({ customer, onSaved, onCancel }: CustomerFormProps) {
  const { role } = useRole();
  const { data: tiers } = useApi(() => pricingApi.listTiers(), [role]);
  const [state, setState] = useState<FormState>(() => toFormState(customer));
  const [validation, setValidation] = useState<string | null>(null);

  // Re-seed the fields when the drawer switches between create and edit.
  useEffect(() => {
    setState(toFormState(customer));
    setValidation(null);
  }, [customer]);

  const save = useMutation((input: CustomerInput) =>
    customer ? customersApi.update(customer.id, input) : customersApi.create(input),
  );

  const set = (patch: Partial<FormState>) => setState((cur) => ({ ...cur, ...patch }));

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state.name.trim() === '') {
      setValidation('กรุณากรอกชื่อลูกค้า');
      return;
    }
    const saved = await save.run({
      name: state.name.trim(),
      phone: state.phone.trim() || undefined,
      email: state.email.trim() || undefined,
      note: state.note.trim() || undefined,
      // '' means the placeholder; the API treats explicit null as "clear".
      priceTierId: state.tierId || null,
    });
    if (saved) onSaved();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
      <Input
        label="ชื่อลูกค้า"
        name="name"
        value={state.name}
        onChange={(event) => set({ name: event.target.value })}
        placeholder="เช่น ร้านสวนเกษตรดี"
        required
      />
      <Input
        label="เบอร์โทร"
        name="phone"
        value={state.phone}
        onChange={(event) => set({ phone: event.target.value })}
        placeholder="053xxxxxx"
        inputMode="tel"
      />
      <Input
        label="อีเมล"
        name="email"
        type="email"
        value={state.email}
        onChange={(event) => set({ email: event.target.value })}
        placeholder="name@example.com"
      />
      <Select
        label="ระดับราคา"
        name="priceTierId"
        value={state.tierId}
        onChange={(event) => set({ tierId: event.target.value })}
        placeholder="ราคาปลีก (ค่าเริ่มต้น)"
        options={(tiers ?? []).map((tier) => ({ value: tier.id, label: tier.name }))}
      />
      <div>
        <label htmlFor="customer-note" className="mb-1 block text-xs font-medium text-slate-600">
          โน้ต
        </label>
        <textarea
          id="customer-note"
          className={fieldClass('min-h-20')}
          value={state.note}
          onChange={(event) => set({ note: event.target.value })}
          placeholder="เช่น ส่งของวันอังคาร-ศุกร์"
        />
      </div>

      {validation ? <p className="text-xs text-rose-600">{validation}</p> : null}
      {save.error ? <p className="text-xs text-rose-600">{save.error.message}</p> : null}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
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
