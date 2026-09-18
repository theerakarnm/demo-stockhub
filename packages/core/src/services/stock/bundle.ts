/**
 * Bundle (สินค้าชุด) expansion.
 *
 * A bundle has no stock of its own. Selling 1 "ชุดอุปกรณ์ตัดหญ้า" must consume
 * its components. Availability of a bundle = min over components of
 * floor(componentAvailable / componentQty).
 */

import type { VariantId } from '../../domain/ids';

export interface BundleComponent {
  componentVariantId: VariantId;
  /** Units of the component inside ONE bundle. */
  qtyPerBundle: number;
}

export interface ExpandedLine {
  variantId: VariantId;
  qty: number;
  /** Set when this line came from expanding a bundle - keeps the audit trail. */
  fromBundleVariantId?: VariantId;
}

/** Replace every bundle line with its component lines. Simple lines pass through. */
export const expandBundles = (
  lines: readonly { variantId: VariantId; qty: number }[],
  componentsByBundle: ReadonlyMap<VariantId, readonly BundleComponent[]>,
): ExpandedLine[] => {
  const out: ExpandedLine[] = [];
  for (const line of lines) {
    const components = componentsByBundle.get(line.variantId);
    if (components === undefined || components.length === 0) {
      out.push({ variantId: line.variantId, qty: line.qty });
      continue;
    }
    for (const component of components) {
      // A component that is itself a bundle is rejected at write time (catalog-repo), so one level is enough.
      out.push({
        variantId: component.componentVariantId,
        qty: component.qtyPerBundle * line.qty,
        fromBundleVariantId: line.variantId,
      });
    }
  }
  return mergeSameVariant(out);
};

/** Two lines for the same variant (a component sold alone and inside a bundle) become one ledger line. */
const mergeSameVariant = (lines: ExpandedLine[]): ExpandedLine[] => {
  const byKey = new Map<string, ExpandedLine>();
  for (const line of lines) {
    const key = `${line.variantId}::${line.fromBundleVariantId ?? ''}`;
    const existing = byKey.get(key);
    if (existing) existing.qty += line.qty;
    else byKey.set(key, { ...line });
  }
  return [...byKey.values()];
};

/** How many bundles can be sold right now, given component on-hand quantities. */
export const bundleAvailability = (
  components: readonly BundleComponent[],
  onHandByVariant: ReadonlyMap<VariantId, number>,
): number => {
  if (components.length === 0) return 0;
  let available = Number.POSITIVE_INFINITY;
  for (const component of components) {
    const onHand = onHandByVariant.get(component.componentVariantId) ?? 0;
    available = Math.min(available, Math.floor(onHand / component.qtyPerBundle));
  }
  return Number.isFinite(available) ? Math.max(available, 0) : 0;
};
