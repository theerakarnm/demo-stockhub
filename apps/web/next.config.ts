import type { NextConfig } from 'next';

/**
 * @stockhub/core ships raw TypeScript (its package.json "exports" points at
 * src/index.ts), so Next must transpile it like local app code.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@stockhub/core'],
  typescript: {
    // Never let a broken type slip into the demo build.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
