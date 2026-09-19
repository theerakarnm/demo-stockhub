/**
 * Every environment value the browser bundle is allowed to see, in one place.
 *
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time, so the reads below
 * must stay literal - do not rewrite them into a dynamic lookup.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787').replace(
  /\/$/,
  '',
);

/**
 * Demo mode makes src/lib/mock-data.ts answer every request so the sales pitch
 * runs with no backend. Set NEXT_PUBLIC_DEMO_MODE=false to hit the real API.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

/**
 * The guided walkthrough (docs/demo-walkthrough.md). Default OFF, and unlike
 * DEMO_MODE the comparison is strict: forgetting to set it must not silently
 * enable the tour on a production build. The tour also needs the real API, so
 * it pairs with NEXT_PUBLIC_DEMO_MODE=false - tour-panel.tsx shows a warning
 * bar when both are on, because then every number would come from mock-data.
 */
export const GUIDED_DEMO = process.env.NEXT_PUBLIC_GUIDED_DEMO === 'true';

/** Seeded demo org used by the x-demo-org header. Replaced by real auth later. */
export const DEMO_ORG_ID =
  process.env.NEXT_PUBLIC_DEMO_ORG_ID ?? '0a000000-0000-4000-8000-000000000001';

export const DEMO_ORG_NAME = process.env.NEXT_PUBLIC_DEMO_ORG_NAME ?? 'ร้านเกษตรรุ่งเรือง';

/** Fake network delay in demo mode, so skeleton states are actually visible. */
export const MOCK_LATENCY_MS = 220;
