import { brand } from '@nooktour/design-tokens';

/**
 * Foundation placeholder. The authenticated dashboard shell (sidebar, org switcher) is built in
 * Phase 3; sign-in/registration in Phase 2. This page intentionally performs no data access.
 */
export default function HomePage() {
  return (
    <main className="nt-foundation">
      <div className="nt-card">
        <p className="nt-wordmark">{brand.name.toLowerCase()}</p>
        <h1>Manager dashboard</h1>
        <p className="nt-muted">
          The foundation is in place. Sign-in, organizations and apartments arrive in the next
          development stages.
        </p>
        <ul className="nt-status" aria-label="Development status">
          <li>Database tenancy and security: ready</li>
          <li>Sign-in: not yet available</li>
          <li>3D scanning: not yet available</li>
        </ul>
      </div>
    </main>
  );
}
