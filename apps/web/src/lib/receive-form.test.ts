import { describe, expect, test } from 'bun:test';
import { buildReceivePayload } from './receive-form';
import type { ReceiveFormState } from './receive-form';

const form = (patch: Partial<ReceiveFormState> = {}): ReceiveFormState => ({
  variantId: 'var_hoe_4h',
  qty: '10',
  unitCostBaht: '120.50',
  reference: '',
  receivedAt: '',
  note: '',
  ...patch,
});

describe('buildReceivePayload', () => {
  test('converts the baht input to integer satang', () => {
    expect(buildReceivePayload(form())).toEqual({
      variantId: 'var_hoe_4h',
      qty: 10,
      unitCost: 12_050,
    });
  });

  test('rejects a fractional quantity', () => {
    expect(buildReceivePayload(form({ qty: '1.5' }))).toEqual({
      error: 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0',
    });
  });

  test('asks for a product before anything else', () => {
    expect(buildReceivePayload(form({ variantId: '' }))).toEqual({ error: 'เลือกสินค้าก่อน' });
  });

  test('omits the reference when the field is blank', () => {
    const result = buildReceivePayload(form({ reference: '   ' }));
    if ('error' in result) throw new Error('expected a valid payload');
    expect(result.reference).toBeUndefined();
  });
});
