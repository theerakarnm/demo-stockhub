import { describe, expect, test } from 'bun:test';
import { ZERO, satang } from '../../domain/money';
import { type OrderLedgerSums, computePlatformFee, orderProfit } from './fee';

describe('computePlatformFee', () => {
  test('charges the channel rate on a marketplace order', () => {
    const result = computePlatformFee({
      channelKind: 'shopee',
      feeRateBps: 1400,
      grandTotal: satang(50_500),
    });

    expect(result).toEqual({ fee: satang(7_070), source: 'channel_default' });
  });

  test('rounds half up once at the order level', () => {
    const result = computePlatformFee({
      channelKind: 'shopee',
      feeRateBps: 1400,
      grandTotal: satang(333),
    });

    expect(result).toEqual({ fee: satang(47), source: 'channel_default' });
  });

  test('charges nothing on an own channel', () => {
    const result = computePlatformFee({
      channelKind: 'pos',
      feeRateBps: 1400,
      grandTotal: satang(50_500),
    });

    expect(result).toEqual({ fee: ZERO, source: 'none' });
  });

  test('keeps the channel_default source at a zero rate', () => {
    const result = computePlatformFee({
      channelKind: 'tiktok',
      feeRateBps: 0,
      grandTotal: satang(50_500),
    });

    expect(result).toEqual({ fee: ZERO, source: 'channel_default' });
  });
});

describe('orderProfit', () => {
  const fullSale: OrderLedgerSums = {
    grandTotal: satang(50_000),
    platformFee: satang(7_000),
    unitsSold: 3,
    soldCost: satang(24_000),
    restoredUnits: 0,
    restoredCost: ZERO,
  };

  test('nets fee and cogs from a full sale', () => {
    expect(orderProfit(fullSale)).toEqual({
      netUnits: 3,
      revenue: satang(50_000),
      fee: satang(7_000),
      cogs: satang(24_000),
      profit: satang(19_000),
    });
  });

  test('prorates revenue and fee on a partial return', () => {
    const sums: OrderLedgerSums = { ...fullSale, restoredUnits: 1, restoredCost: satang(8_000) };

    expect(orderProfit(sums)).toEqual({
      netUnits: 2,
      revenue: satang(33_333), // roundHalfUp(50000 * 2 / 3)
      fee: satang(4_667), // roundHalfUp(7000 * 2 / 3)
      cogs: satang(16_000),
      profit: satang(12_666),
    });
  });

  test('zeros out a fully returned order', () => {
    const sums: OrderLedgerSums = { ...fullSale, restoredUnits: 3, restoredCost: satang(24_000) };

    expect(orderProfit(sums)).toEqual({
      netUnits: 0,
      revenue: ZERO,
      fee: ZERO,
      cogs: ZERO,
      profit: ZERO,
    });
  });

  test('never passes a negative-cogs input through', () => {
    // restoredCost above soldCost cannot exist (returns restore the original
    // consume cost), and even the equality boundary must not leak a negative.
    const sums: OrderLedgerSums = { ...fullSale, restoredUnits: 3, restoredCost: satang(24_000) };

    const result = orderProfit(sums);

    expect(result.netUnits).toBe(0);
    expect(result.revenue).toBe(ZERO);
    expect(result.fee).toBe(ZERO);
    expect(result.cogs).toBe(ZERO);
    expect(result.profit).toBe(ZERO);
  });
});
