-- =====================================================================================
-- Nookscanner Stage 10.6: account deletion (APP_STORE_COMPLIANCE S3/S4; Apple 5.1.1(v)).
-- The delete-account Edge Function (user's session -> service role) calls these:
--   account_deletion_blockers(user) -> companies the user is the ONLY owner of (deletion is refused
--                                      until ownership is transferred or the company deleted)
--   record_account_deletion(user)   -> one audit entry per company before the auth user is removed
-- Every reference to auth.users cascades or is set null (checked), so removing the auth user
-- deletes memberships and the profile and keeps company data.
-- =====================================================================================

create function private.account_deletion_blockers(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb)
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = p_user and m.role = 'owner'
    and not exists (
      select 1 from public.organization_members other
      where other.organization_id = m.organization_id and other.role = 'owner' and other.user_id <> p_user
    );
$$;

create function private.record_account_deletion(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  select m.organization_id, p_user, 'account.deleted', 'user', p_user::text
  from public.organization_members m where m.user_id = p_user
  union all
  select null, p_user, 'account.deleted', 'user', p_user::text
  where not exists (select 1 from public.organization_members m where m.user_id = p_user);
$$;

revoke execute on function private.account_deletion_blockers(uuid), private.record_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function private.account_deletion_blockers(uuid), private.record_account_deletion(uuid)
  to service_role;
