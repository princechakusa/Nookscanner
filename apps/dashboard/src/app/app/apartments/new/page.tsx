import type { Metadata } from 'next';
import Link from 'next/link';
import { getOrgContext } from '../../../../lib/org-context.ts';
import { NoOrganization } from '../../no-organization.tsx';
import { createApartmentAction } from '../../property-actions.ts';
import { ApartmentForm } from '../../property-forms.tsx';

export const metadata: Metadata = { title: 'New apartment' };

export default async function NewApartmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, activeOrg, can } = await getOrgContext();
  if (!activeOrg) return <NoOrganization title="New apartment" />;
  const params = await searchParams;
  const { data } = await supabase
    .from('properties')
    .select('id, name')
    .eq('organization_id', activeOrg.id)
    .order('name');
  const properties = (data ?? []) as Array<{ id: string; name: string }>;
  const preselected = properties.find((p) => p.id === params.property)?.id;

  if (!can('apartment.create') || properties.length === 0) {
    return (
      <div className="ns-page">
        <h1 className="ns-page__title">New apartment</h1>
        <section className="ns-panel">
          <p>
            {properties.length === 0
              ? 'Add a property before adding apartments.'
              : 'Your role cannot add apartments. Ask an admin or manager.'}
          </p>
          <p>
            <Link href="/app/apartments">Back to apartments</Link>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="ns-page">
      <h1 className="ns-page__title">New apartment</h1>
      <section className="ns-panel">
        <ApartmentForm
          action={createApartmentAction}
          properties={properties}
          values={
            preselected
              ? { property_id: preselected, name: '', unit_number: null, floor: null, layout: null }
              : undefined
          }
          submitLabel="Create apartment"
        />
      </section>
    </div>
  );
}
