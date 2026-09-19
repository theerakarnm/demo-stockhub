/**
 * Platform fee and order profit rules - pure functions over ledger sums.
 *
 * Why in core: the import path (L3) and the report SQL path (L5) must apply
 * one identical rounding rule, so the math lives here where tests can pin it
 * and neither caller can drift. Money stays integer satang; percentages are
 * integer basis points; every division rounds half up exactly once.
 */

import type { ChannelKind, FeeSource } from '../../domain/enums';
import { IMPORTABLE_CHANNEL_KINDS } from '../../domain/enums';
import { type Satang, ZERO, satang } from '../../domain/money';

/** Round half up to a whole satang value. Input is always non-negative here. */
const roundHalfUp = (value: number): Satang => satang(Math.floor(value + 0.5));

export const computePlatformFee = (input: {
  channelKind: ChannelKind;
  feeRateBps: number;
  grandTotal: Satang;
}): { fee: Satang; source: FeeSource } => {
  const marketplace = (IMPORTABLE_CHANNEL_KINDS as readonly ChannelKind[]).includes(
    input.channelKind,
  );
  if (!marketplace) return { fee: ZERO, source: 'none' };
  // Money-integer rule: one rounding, half up, at the order level.
  const fee = roundHalfUp((input.grandTotal * input.feeRateBps) / 10_000);
  return { fee, source: 'channel_default' };
};

/** Ledger truth for one order, summed from movements by the caller (L5). */
export interface OrderLedgerSums {
  grandTotal: Satang;
  platformFee: Satang;
  unitsSold: number;
  soldCost: Satang;
  restoredUnits: number;
  restoredCost: Satang;
}

export interface OrderProfit {
  netUnits: number;
  revenue: Satang;
  fee: Satang;
  cogs: Satang;
  profit: Satang;
}

export const orderProfit = (sums: OrderLedgerSums): OrderProfit => {
  const netUnits = sums.unitsSold - sums.restoredUnits;
  // Defensive stop-gap only: the report SQL never returns an order without a
  // sale, so unitsSold <= 0 means a caller bug. Degrade to zeros, never NaN.
  if (sums.unitsSold <= 0 || netUnits <= 0) {
    return { netUnits: 0, revenue: ZERO, fee: ZERO, cogs: ZERO, profit: ZERO };
  }
  // D4: goods came home, so revenue and fee are prorated by netUnits/unitsSold,
  // each rounded half up once; COGS nets the restored cost against the sold cost.
  const revenue = roundHalfUp((sums.grandTotal * netUnits) / sums.unitsSold);
  const fee = roundHalfUp((sums.platformFee * netUnits) / sums.unitsSold);
  const cogs = satang(sums.soldCost - sums.restoredCost);
  return { netUnits, revenue, fee, cogs, profit: satang(revenue - fee - cogs) };
};
