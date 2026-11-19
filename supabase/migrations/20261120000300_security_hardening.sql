-- =====================================================================================
-- Nookscanner Stage 2.6: findings of the Phase 2 backend security review
-- (docs/SECURITY.md section 10, THREAT_MODEL T25-T28). Supabase security advisors reported no
-- issues; these are logic findings from the manual policy review.
-- =====================================================================================

-- ---------- F1: memberships only through create_organization / accept_invitation ---------
-- Previously an admin could insert any user id into their organization without consent and then
-- read that user's profile through the org-mates policy (T25).
drop policy members_insert on public.organization_members;
revoke insert on public.organization_members from authenticated;

-- ---------- F2/F3: column-restricted updates (T26) -------------------------------------
-- organizations.created_by and apartments.public_id (used in asset paths) are immutable for
-- clients. Column grants replace the table-wide UPDATE grant.
revoke update on public.organizations from authenticated;
grant update (name, slug, default_locale) on public.organizations to authenticated;

revoke update on public.apartments from authenticated;
grant update (property_id, name, unit_number, floor, status, layout, archived_at)
  on public.apartments to authenticated;

revoke update on public.properties from authenticated;
grant update (name, address_line1, address_line2, city, country_code, timezone, default_locale,
              support_phone, support_email, support_whatsapp, archived_at)
  on public.properties to authenticated;

-- ---------- F4: checkpoint upload must belong to the same scan session (T27) ------------
create function public.check_checkpoint_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.media_upload_id is not null and not exists (
    select 1 from public.media_uploads mu
    where mu.id = new.media_upload_id and mu.scan_session_id = new.scan_session_id
  ) then
    raise exception 'upload does not belong to this scan session' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger scan_checkpoints_check_upload before insert or update of media_upload_id, scan_session_id
  on public.scan_checkpoints for each row execute function public.check_checkpoint_upload();

-- ---------- F5: cap registrations per scan session (T12/T28) -----------------------------
create or replace function public.register_media_upload(
  p_scan_session uuid,
  p_filename text,
  p_mime text,
  p_size_bytes bigint
)
returns public.media_uploads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.scan_sessions;
  v_id uuid := gen_random_uuid();
  v_ext text;
  v_row public.media_uploads;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  -- Lock the session row so concurrent registrations cannot exceed the cap.
  select * into v_session from public.scan_sessions s where s.id = p_scan_session for update;
  if v_session.id is null or not coalesce(public.can_access_apartment(v_session.apartment_id, 'scan.create'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_session.status not in ('draft', 'recording', 'uploading') then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;
  -- A walkthrough is one or a few files; 20 also covers per-room segments from the app.
  if (select count(*) from public.media_uploads mu where mu.scan_session_id = v_session.id) >= 20 then
    raise exception 'UPLOAD_LIMIT_REACHED' using errcode = '54000';
  end if;

  v_ext := case lower(p_mime) when 'video/mp4' then '.mp4' when 'video/quicktime' then '.mov' end;
  if v_ext is null then
    raise exception 'UPLOAD_REJECTED' using errcode = '22023';
  end if;

  insert into public.media_uploads (id, organization_id, scan_session_id, object_path, original_filename,
                                    mime_type, size_bytes, created_by)
  values (v_id, v_session.organization_id, v_session.id,
          'org/' || v_session.organization_id || '/scans/' || v_session.id || '/' || v_id || v_ext,
          left(btrim(p_filename), 255), lower(p_mime), p_size_bytes, (select auth.uid()))
  returning * into v_row;

  update public.scan_sessions set status = 'uploading' where id = v_session.id and status = 'draft';
  return v_row;
end;
$$;

revoke execute on function public.register_media_upload(uuid, text, text, bigint) from public, anon;
grant execute on function public.register_media_upload(uuid, text, text, bigint) to authenticated;
revoke execute on function public.check_checkpoint_upload() from public, anon, authenticated;

-- ---------- Indexes for foreign keys (Supabase performance advisor) ----------------------
-- Keeps user deletion (ON DELETE SET NULL) and per-room/upload lookups off sequential scans.
create index organizations_created_by_idx on public.organizations (created_by);
create index organization_members_invited_by_idx on public.organization_members (invited_by);
create index organization_invitations_invited_by_idx on public.organization_invitations (invited_by);
create index organization_invitations_accepted_by_idx on public.organization_invitations (accepted_by);
create index qr_codes_created_by_idx on public.qr_codes (created_by);
create index qr_codes_revoked_by_idx on public.qr_codes (revoked_by);
create index scan_sessions_created_by_idx on public.scan_sessions (created_by);
create index scan_checkpoints_room_idx on public.scan_checkpoints (room_id);
create index scan_checkpoints_media_upload_idx on public.scan_checkpoints (media_upload_id);
create index media_uploads_created_by_idx on public.media_uploads (created_by);
create index role_permissions_permission_idx on public.role_permissions (permission);
