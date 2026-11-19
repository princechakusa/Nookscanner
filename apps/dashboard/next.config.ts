import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security-headers.ts';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@nooktour/shared', '@nooktour/design-tokens'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders({ isDev: process.env.NODE_ENV !== 'production' }),
      },
    ];
  },
};

export default nextConfig;
