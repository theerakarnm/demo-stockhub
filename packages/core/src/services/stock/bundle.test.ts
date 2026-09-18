import { describe, expect, test } from 'bun:test';
import { type VariantId, asVariantId } from '../../domain/ids';
import { type BundleComponent, bundleAvailability, expandBundles } from './bundle';

const hose = asVariantId('V-HOSE');
const nozzle = asVariantId('V-NOZZLE');
const conn = asVariantId('V-CONN');
const kit = asVariantId('V-KIT');
const mower = asVariantId('V-MOWER');
const blade = asVariantId('V-BLADE');
const glove = asVariantId('V-GLOVE');

const emptyRecipes = new Map<VariantId, readonly BundleComponent[]>();

describe('expandBundles', () => {
  test('a simple line passes through unchanged', () => {
    const result = expandBundles([{ variantId: hose, qty: 3 }], emptyRecipes);
    expect(result).toEqual([{ variantId: hose, qty: 3 }]);
  });

  test('bundle lines expand to their components carrying fromBundleVariantId', () => {
    const recipes = new Map<VariantId, readonly BundleComponent[]>([
      [
        kit,
        [
          { componentVariantId: hose, qtyPerBundle: 1 },
          { componentVariantId: nozzle, qtyPerBundle: 1 },
          { componentVariantId: conn, qtyPerBundle: 2 },
        ],
      ],
    ]);
    const result = expandBundles([{ variantId: kit, qty: 2 }], recipes);
    expect(result).toEqual([
      { variantId: hose, qty: 2, fromBundleVariantId: kit },
      { variantId: nozzle, qty: 2, fromBundleVariantId: kit },
      { variantId: conn, qty: 4, fromBundleVariantId: kit },
    ]);
  });

  test('a component sold alone and inside a bundle stays two lines', () => {
    const recipes = new Map<VariantId, readonly BundleComponent[]>([
      [kit, [{ componentVariantId: hose, qtyPerBundle: 2 }]],
    ]);
    const result = expandBundles(
      [
        { variantId: hose, qty: 5 },
        { variantId: kit, qty: 3 },
      ],
      recipes,
    );
    expect(result).toEqual([
      { variantId: hose, qty: 5 },
      { variantId: hose, qty: 6, fromBundleVariantId: kit },
    ]);
  });
});

describe('bundleAvailability', () => {
  const mowerRecipe: BundleComponent[] = [
    { componentVariantId: mower, qtyPerBundle: 1 },
    { componentVariantId: blade, qtyPerBundle: 2 },
    { componentVariantId: glove, qtyPerBundle: 1 },
  ];

  test('is the min over components of floor(onHand / qtyPerBundle)', () => {
    const onHand = new Map<VariantId, number>([
      [mower, 10],
      [blade, 350],
      [glove, 700],
    ]);
    expect(bundleAvailability(mowerRecipe, onHand)).toBe(10);
    const lowBlade = new Map<VariantId, number>(onHand);
    lowBlade.set(blade, 3);
    expect(bundleAvailability(mowerRecipe, lowBlade)).toBe(1);
  });

  test('a component missing from the on-hand map gives 0', () => {
    const onHand = new Map<VariantId, number>([[blade, 4]]);
    expect(bundleAvailability(mowerRecipe, onHand)).toBe(0);
  });

  test('an empty recipe gives 0', () => {
    const onHand = new Map<VariantId, number>([[hose, 100]]);
    expect(bundleAvailability([], onHand)).toBe(0);
  });
});
