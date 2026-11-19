import { brand } from '@nookscanner/design-tokens';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="nt-foundation">
      <div className="nt-card nt-auth-card">
        <p className="nt-wordmark">{brand.name.toLowerCase()}</p>
        {children}
      </div>
    </main>
  );
}
