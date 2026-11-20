import { EmptyState } from '@nookscanner/ui';
import Link from 'next/link';

/** Shown on organization-scoped pages before the person belongs to any organization. */
export function NoOrganization({ title }: { title: string }) {
  return (
    <div className="ns-page">
      <h1 className="ns-page__title">{title}</h1>
      <section className="ns-panel">
        <EmptyState
          title="No organization yet"
          body="Create an organization in Settings, or open an invitation link from a colleague."
        />
        <p>
          <Link href="/app/settings">Go to Settings</Link>
        </p>
      </section>
    </div>
  );
}
