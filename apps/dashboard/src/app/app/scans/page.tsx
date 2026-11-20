import { DataTable, EmptyState, StatusPill, type Status } from '@nookscanner/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getOrgContext } from '../../../lib/org-context.ts';
import { NoOrganization } from '../no-organization.tsx';
import { SCAN_STATUS } from '../scan-status.ts';

export const metadata: Metadata = { title: 'Scans' };

interface Row {
  id: string;
  method: string;
  status: string;
  created_at: string;
  apartments: { id: string; name: string } | null;
}

/** All captures and uploads of the active organization (RLS limits rows to what the person may see). */
export default async function ScansPage() {
  const { supabase, activeOrg } = await getOrgContext();
  if (!activeOrg) return <NoOrganization title="Scans" />;
  const { data } = await supabase
    .from('scan_sessions')
    .select('id, method, status, created_at, apartments(id, name)')
    .eq('organization_id', activeOrg.id)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="ns-page">
      <h1 className="ns-page__title">Scans</h1>
      <p className="ns-muted">
        Every capture or uploaded walkthrough, its processing status and its quality review.
      </p>
      <DataTable
        caption="Scans"
        rowKey={(r) => r.id}
        rows={rows}
        empty={
          <EmptyState
            title="No scans yet"
            body="Open an apartment and upload a walkthrough video, or record one with Nookscanner Capture."
          />
        }
        columns={[
          {
            key: 'apartment',
            header: 'Apartment',
            render: (r) => (
              <Link href={`/app/scans/${r.id}`}>{r.apartments?.name ?? 'Apartment'}</Link>
            ),
          },
          {
            key: 'method',
            header: 'Source',
            render: (r) =>
              r.method === 'guided_capture' ? 'Nookscanner Capture' : 'Uploaded video',
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => {
              const s = SCAN_STATUS[r.status] ?? { tone: 'draft' as Status, label: r.status };
              return <StatusPill status={s.tone} label={s.label} />;
            },
          },
          {
            key: 'created',
            header: 'Started',
            render: (r) => new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' '),
          },
        ]}
      />
    </div>
  );
}
