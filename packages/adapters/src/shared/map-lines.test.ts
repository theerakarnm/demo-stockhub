/**
 * Shared line mapper + order assembler tests.
 *
 * mapLine / assembleOrder serve all three adapters, so the bad-row behaviour
 * that AGENTS.md rule 2 demands is specified here once: a broken row pushes a
 * ParseIssue and is skipped, it never throws and never sinks the whole order.
 */

import { describe, expect, test } from 'bun:test';
import { type NormalizedOrderLine, type ParseIssue, ZERO, satang } from '@stockhub/core';
import { type LineColumns, type OrderDraft, assembleOrder, mapLine } from './map-lines';

/** Logical headers for the test rows - mapLine only sees what these point at. */
const COLUMNS: LineColumns = {
  platformSku: 'sku',
  quantity: 'qty',
  unitPrice: 'price',
  sellerDiscount: 'discount',
  productName: 'name',
  variationName: 'variation',
  externalLineId: 'line',
};

const ROW: Record<string, string> = {
  sku: 'HOE-001',
  name: 'จอบถางหญ้า',
  variation: 'ด้ามยาว',
  qty: '2',
  price: '259.00',
  discount: '0.00',
  line: 'item-1',
};

const DRAFT: OrderDraft = {
  externalOrderId: '260214FAKE001',
  status: 'shipped',
  orderedAt: new Date('2026-02-14T02:12:33.000Z'),
  rows: [ROW],
  rowNumbers: [2],
};

describe('mapLine', () => {
  test('skips the line and pushes bad_quantity for an unreadable quantity', () => {
    const issues: ParseIssue[] = [];

    const line = mapLine({ ...ROW, qty: 'abc' }, 7, COLUMNS, issues);

    expect(line).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', row: 7, code: 'bad_quantity' });
  });

  test('skips the line and pushes missing_sku when the SKU cell is empty', () => {
    const issues: ParseIssue[] = [];

    // cell() reads an empty string as absent, which is exactly how the CSV
    // reader hands over a blank SKU cell.
    const line = mapLine({ ...ROW, sku: '' }, 3, COLUMNS, issues);

    expect(line).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', row: 3, code: 'missing_sku' });
  });
});

describe('assembleOrder', () => {
  test('pushes empty_order and returns undefined when no line survived', () => {
    const issues: ParseIssue[] = [];

    const order = assembleOrder(DRAFT, [], 'shopee', issues);

    expect(order).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', code: 'empty_order' });
  });

  test('warns total_mismatch on a 1 baht difference but still returns the order', () => {
    const issues: ParseIssue[] = [];
    const line: NormalizedOrderLine = {
      platformSku: 'HOE-001',
      platformProductName: 'จอบถางหญ้า',
      quantity: 1,
      unitPrice: satang(10_000), // computed 100.00 baht
      discount: ZERO,
    };

    const order = assembleOrder({ ...DRAFT, grandTotal: satang(9_900) }, [line], 'shopee', issues);

    expect(order?.grandTotal).toBe(satang(9_900));
    expect(order?.lines).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', code: 'total_mismatch' });
    // Both numbers must be in the message so support can judge the column map.
    expect(issues[0]?.message).toContain('9900');
    expect(issues[0]?.message).toContain('10000');
  });
});
