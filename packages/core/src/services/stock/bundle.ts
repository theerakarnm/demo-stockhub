/**
 * Bundle (สินค้าชุด) expansion.
 *
 * A bundle has no stock of its own. Selling 1 "ชุดอุปกรณ์ตัดหญ้า" must consume
 * its components. Availability of a bundle = min over components of
 * floor(componentAvailable / componentQty).
 *
 * TODO(template): implement both functions.
 */

import type { VariantId } from '../../domain/ids';
import { NotImplementedError } from '../../errors';

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
  _lines: readonly { variantId: VariantId; qty: number }[],
  _componentsByBundle: ReadonlyMap<VariantId, readonly BundleComponent[]>,
): ExpandedLine[] => {
  throw new NotImplementedError('expandBundles');
};

/** How many bundles can be sold right now, given component on-hand quantities. */
export const bundleAvailability = (
  _components: readonly BundleComponent[],
  _onHandByVariant: ReadonlyMap<VariantId, number>,
): number => {
  throw new NotImplementedError('bundleAvailability');
};
