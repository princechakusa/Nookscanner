import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { brand } from '@nooktour/design-tokens';
import '@nooktour/design-tokens/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${brand.name} Dashboard`, template: `%s | ${brand.name}` },
  description: 'Manage your apartments, 3D scans and guest instructions.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
