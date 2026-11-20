import { layoutSummary, parseLayout } from '@nookscanner/shared';
import { DataTable, EmptyState } from '@nookscanner/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getOrgContext } from '../../../lib/org-context.ts';
import { ApartmentStatus } from '../apartment-status.tsx';
import { NoOrganization } from '../no-organization.tsx';

export const metadata: Metadata = { title: 'Apartments' };

interface ApartmentRow {
  id: string;
  name: string;
  unit_number: string | null;
  status: string;
  layout: unknown;
  properties: { id: string; name: string } | null;
}

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, activeOrg, can } = await getOrgContext();
  if (!activeOrg) return <NoOrganization title="Apartments" />;
  const params = await searchParams;

  // RLS limits this to apartments in properties the person may read.
  const [{ data }, { count: propertyCount }] = await Promise.all([
    supabase
      .from('apartments')
      .select('id, name, unit_number, status, layout, properties(id, name)')
      .eq('organization_id', activeOrg.id)
      .order('name'),
    supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', activeOrg.id),
  ]);
  const rows = (data ?? []) as unknown as ApartmentRow[];
  const canCreate = can('apartment.create') && (propertyCount ?? 0) > 0;

  return (
    <div className="ns-page">
      <div className="ns-page__header">
        <h1 className="ns-page__title">Apartments</h1>
        {canCreate && (
          <Link className="ns-btn ns-btn--primary ns-btn--md" href="/app/apartments/new">
            Add apartment
          </Link>
        )}
      </div>
      {params.deleted === '1' && (
        <p className="ns-notice" role="status">
          Apartment deleted.
        </p>
      )}
      <section className="ns-panel">
        <DataTable
          caption="Apartments"
          rowKey={(a) => a.id}
          rows={rows}
          empty={
            <EmptyState
              title="No apartments yet"
              body={
                (propertyCount ?? 0) === 0
                  ? 'Add a property first, then add its apartments.'
                  : 'Add an apartment to plan its rooms and start a capture.'
              }
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (a) => <Link href={`/app/apartments/${a.id}`}>{a.name}</Link>,
            },
            { key: 'property', header: 'Property', render: (a) => a.properties?.name ?? '-' },
            { key: 'unit', header: 'Unit', render: (a) => a.unit_number ?? '-' },
            {
              key: 'layout',
              header: 'Layout',
              render: (a) => layoutSummary(parseLayout(a.layout)),
            },
            {
              key: 'status',
              header: 'Status',
              render: (a) => <ApartmentStatus status={a.status} />,
            },
          ]}
        />
      </section>
      {(propertyCount ?? 0) === 0 && can('property.create') && (
        <p>
          <Link href="/app/properties">Add a property</Link>
        </p>
      )}
    </div>
  );
}
