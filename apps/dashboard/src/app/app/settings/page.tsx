import { DataTable, EmptyState } from '@nookscanner/ui';
import type { Metadata } from 'next';
import { ROLE_LABELS } from '../../../lib/messages.ts';
import { getOrgContext } from '../../../lib/org-context.ts';
import { CreateOrgForm, InviteForm, MemberControls } from '../forms.tsx';
import {
  changeRoleAction,
  createOrganizationAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
} from '../org-actions.ts';

export const metadata: Metadata = { title: 'Settings' };

interface MemberRow {
  user_id: string;
  role: string;
  scope: string;
}
interface InviteRow {
  id: string;
  email: string;
  role: string;
  scope: string;
  expires_at: string;
}

export default async function SettingsPage() {
  const { supabase, user, activeOrg, role, can } = await getOrgContext();

  if (!activeOrg) {
    return (
      <div className="ns-page">
        <h1 className="ns-page__title">Settings</h1>
        <section className="ns-panel">
          <h2 className="ns-panel__title">Create your organization</h2>
          <CreateOrgForm action={createOrganizationAction} />
        </section>
      </div>
    );
  }

  const canManage = can('member.manage');
  const [{ data: memberRows }, { data: inviteRows }, { data: propertyRows }] = await Promise.all([
    supabase
      .from('organization_members')
      .select('user_id, role, scope')
      .eq('organization_id', activeOrg.id),
    canManage
      ? supabase
          .from('organization_invitations')
          .select('id, email, role, scope, expires_at')
          .eq('organization_id', activeOrg.id)
          .is('accepted_at', null)
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from('properties')
      .select('id, name')
      .eq('organization_id', activeOrg.id)
      .order('name'),
  ]);
  const members = (memberRows ?? []) as MemberRow[];
  const invites = (inviteRows ?? []) as InviteRow[];
  const properties = (propertyRows ?? []) as Array<{ id: string; name: string }>;
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in(
      'id',
      members.map((m) => m.user_id),
    );
  const names = new Map(
    ((profileRows ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  return (
    <div className="ns-page">
      <h1 className="ns-page__title">Settings</h1>
      <p className="ns-muted">
        {activeOrg.name} · your role: {role ? ROLE_LABELS[role] : '-'}
      </p>

      <section className="ns-panel" aria-labelledby="members-h">
        <h2 id="members-h" className="ns-panel__title">
          Members
        </h2>
        <DataTable
          caption="Members"
          rowKey={(m) => m.user_id}
          rows={members}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (m) =>
                `${names.get(m.user_id) ?? 'Member'}${m.user_id === user.id ? ' (you)' : ''}`,
            },
            {
              key: 'access',
              header: 'Access',
              render: (m) => (m.scope === 'properties' ? 'Selected properties' : 'All properties'),
            },
            {
              key: 'role',
              header: 'Role',
              render: (m) =>
                canManage || m.user_id === user.id ? (
                  <MemberControls
                    memberName={names.get(m.user_id) ?? 'member'}
                    userId={m.user_id}
                    role={m.role}
                    canSetOwner={role === 'owner'}
                    changeRole={changeRoleAction}
                    remove={removeMemberAction}
                    isSelf={m.user_id === user.id}
                  />
                ) : (
                  ROLE_LABELS[m.role]
                ),
            },
          ]}
        />
      </section>

      {canManage && (
        <>
          <section className="ns-panel" aria-labelledby="invite-h">
            <h2 id="invite-h" className="ns-panel__title">
              Invite a team member
            </h2>
            <InviteForm action={inviteMemberAction} properties={properties} />
          </section>

          <section className="ns-panel" aria-labelledby="pending-h">
            <h2 id="pending-h" className="ns-panel__title">
              Pending invitations
            </h2>
            <DataTable
              caption="Pending invitations"
              rowKey={(i) => i.id}
              rows={invites}
              empty={<EmptyState title="No pending invitations" />}
              columns={[
                { key: 'email', header: 'Email', render: (i) => i.email },
                { key: 'role', header: 'Role', render: (i) => ROLE_LABELS[i.role] },
                {
                  key: 'expires',
                  header: 'Expires',
                  render: (i) => new Date(i.expires_at).toISOString().slice(0, 10),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (i) => (
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="invitationId" value={i.id} />
                      <button type="submit" className="ns-btn ns-btn--ghost ns-btn--sm">
                        Revoke
                      </button>
                    </form>
                  ),
                },
              ]}
            />
          </section>
        </>
      )}

      <section className="ns-panel" aria-labelledby="neworg-h">
        <h2 id="neworg-h" className="ns-panel__title">
          Create another organization
        </h2>
        <CreateOrgForm action={createOrganizationAction} />
      </section>
    </div>
  );
}
