import type { Metadata } from 'next';
import Link from 'next/link';
import { getOrgContext } from '../../../lib/org-context.ts';
import { SectionPlaceholder } from '../section-placeholder.tsx';

export const metadata: Metadata = { title: 'Appliances & instructions' };

interface Row {
  id: string;
  name_en: string;
  brand: string | null;
  model_number: string | null;
  apartments: { id: string; name: string } | null;
  rooms: { name_en: string } | null;
  appliance_categories: { name_en: string } | null;
}

/** Stage 8.1: every appliance the person can see in the active organization (RLS-filtered). */
export default async function AppliancesPage() {
  const { supabase, activeOrg } = await getOrgContext();
  const { data } = await supabase
    .from('appliances')
    .select(
      'id, name_en, brand, model_number, apartments(id, name), rooms(name_en), appliance_categories(name_en)',
    )
    .eq('organization_id', activeOrg?.id ?? '')
    .order('name_en')
    .limit(500);
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) {
    return (
      <SectionPlaceholder
        title={'Appliances & instructions'}
        emptyTitle={'No appliances yet'}
        body={
          'Open an apartment and add its appliances room by room. Pinning them in the 3D apartment and instructions follow.'
        }
      />
    );
  }
  return (
    <div className="ns-page">
      <h1 className="ns-page__title">Appliances &amp; instructions</h1>
      <section className="ns-panel" aria-labelledby="all-appliances-h">
        <h2 id="all-appliances-h" className="ns-panel__title">
          All appliances ({rows.length})
        </h2>
        <ul className="ns-rooms" aria-label="All appliances">
          {rows.map((a) => (
            <li key={a.id} className="ns-rooms__item">
              <div className="ns-rooms__row">
                <span className="ns-rooms__name">
                  <span className="ns-rooms__en">{a.name_en}</span>
                </span>
                <span className="ns-muted">
                  {[a.appliance_categories?.name_en, a.brand, a.model_number]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {a.apartments && (
                  <Link href={`/app/apartments/${a.apartments.id}`}>
                    {a.apartments.name}
                    {a.rooms ? ` · ${a.rooms.name_en}` : ''}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
