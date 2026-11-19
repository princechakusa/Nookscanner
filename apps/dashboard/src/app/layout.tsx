import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { brand } from '@nookscanner/design-tokens';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@nookscanner/design-tokens/tokens.css';
import '@nookscanner/ui/ui.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${brand.name} Dashboard`, template: `%s | ${brand.name}` },
  description: 'Manage your apartments, 3D scans and guest instructions.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers makes every page dynamic, so Next.js can apply the per-request CSP
  // nonce set by src/proxy.ts to its scripts (a static page would carry no nonce).
  await headers();
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
