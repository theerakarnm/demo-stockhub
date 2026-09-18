/**
 * Which stock action an order status transition implies.
 *
 * Pure table - no clock, no database - so the import applier and the POS
 * cancel / return flow answer "consume, restore, nothing, or refuse?"
 * identically. `alreadyMoved` guards the repeated-webhook case: a platform
 * that flips the same shipped order to cancelled twice must not restore the
 * stock twice, and a duplicate ship must not consume twice.
 */

import type { OrderStatus } from '../../domain/enums';

/** What the caller must do to stock when an order moves between statuses. */
export type StockEffect = 'consume' | 'restore' | 'none' | 'invalid';

export const stockEffectOf = (
  from: OrderStatus,
  to: OrderStatus,
  alreadyMoved: boolean,
): StockEffect => {
  // A same-status "transition" is a duplicate event, never a no-op: it would
  // re-consume or re-restore, so it is refused instead of silently reapplied.
  if (from === to) return 'invalid';
  switch (to) {
    case 'shipped':
      // Stock leaves only on the first ship from a pre-ship status.
      return from === 'pending' || from === 'confirmed' ? 'consume' : 'invalid';
    case 'cancelled':
    case 'returned':
      // Nothing deducted yet (a pending order cancelled): only the status moves.
      if (!alreadyMoved) return 'none';
      return from === 'shipped' || from === 'delivered' ? 'restore' : 'none';
    case 'delivered':
      // Hand-over moves no stock: it already left at 'shipped'.
      return from === 'shipped' ? 'none' : 'invalid';
    case 'pending':
    case 'confirmed':
      // Backwards to a pre-ship status would desynchronise the ledger.
      return 'invalid';
  }
};
