import { DataTable, EmptyState } from '@nookscanner/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getOrgContext } from '../../../lib/org-context.ts';
import { NoOrganization } from '../no-organization.tsx';
import { createPropertyAction } from '../property-actions.ts';
import { PropertyForm } from '../property-forms.tsx';

export const metadata: Metadata = { title: 'Properties' };

interface PropertyRow {
  id: string;
  name: string;
  city: string | null;
  country_code: string | null;
  apartments: Array<{ count: number }>;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, activeOrg, can } = await getOrgContext();
  if (!activeOrg) return <NoOrganization title="Properties" />;
  const params = await searchParams;

  // RLS returns only the properties this person may read (all, or the assigned ones).
  const { data } = await supabase
    .from('properties')
    .select('id, name, city, country_code, apartments(count)')
    .eq('organization_id', activeOrg.id)
    .order('name');
  const rows = (data ?? []) as PropertyRow[];

  return (
    <div className="ns-page">
      <h1 className="ns-page__title">Properties</h1>
      {params.deleted === '1' && (
        <p className="ns-notice" role="status">
          Property deleted.
        </p>
      )}
      <section className="ns-panel" aria-labelledby="props-h">
        <h2 id="props-h" className="ns-panel__title">
          Your properties
        </h2>
        <DataTable
          caption="Properties"
          rowKey={(p) => p.id}
          rows={rows}
          empty={
            <EmptyState
              title="No properties yet"
              body="Properties group your apartments by building or site."
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (p) => <Link href={`/app/properties/${p.id}`}>{p.name}</Link>,
            },
            {
              key: 'location',
              header: 'Location',
              render: (p) => [p.city, p.country_code].filter(Boolean).join(', ') || '-',
            },
            {
              key: 'apartments',
              header: 'Apartments',
              render: (p) => String(p.apartments[0]?.count ?? 0),
            },
          ]}
        />
      </section>
      {can('property.create') && (
        <section className="ns-panel" aria-labelledby="newprop-h">
          <h2 id="newprop-h" className="ns-panel__title">
            Add a property
          </h2>
          <PropertyForm action={createPropertyAction} submitLabel="Create property" />
        </section>
      )}
    </div>
  );
}
