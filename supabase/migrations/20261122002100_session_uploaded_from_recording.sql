-- KI fix: walkthroughs recorded in the capture app stayed in 'recording' after their video
-- finished uploading. The app marks the session 'recording' (with device info) before it queues
-- the upload; creating the upload only moved 'draft' to 'uploading', and completing the last part
-- only moved 'uploading' to 'uploaded'. A 'recording' session therefore never became 'uploaded',
-- so it could not be submitted for 3D processing.
--
-- Fix: whenever an upload becomes 'uploaded', its session becomes 'uploaded' if it is still in
-- draft, recording or uploading and none of its uploads is pending. One trigger covers both
-- storage backends (Supabase and R2) without rewriting their completion functions.

create function private.session_uploaded_after_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.scan_sessions s set status = 'uploaded'
  where s.id = new.scan_session_id
    and s.status in ('draft', 'recording', 'uploading')
    and not exists (select 1 from public.media_uploads mu
                    where mu.scan_session_id = s.id and mu.status = 'pending');
  return null;
end;
$$;

revoke execute on function private.session_uploaded_after_upload() from public, anon, authenticated;

create trigger media_uploads_session_uploaded
after update of status on public.media_uploads
for each row
when (new.status = 'uploaded' and old.status is distinct from 'uploaded')
execute function private.session_uploaded_after_upload();

-- Backfill: sessions stuck in 'recording' whose uploads are all complete.
update public.scan_sessions s set status = 'uploaded'
where s.status in ('recording', 'uploading')
  and exists (select 1 from public.media_uploads mu
              where mu.scan_session_id = s.id and mu.status = 'uploaded')
  and not exists (select 1 from public.media_uploads mu
                  where mu.scan_session_id = s.id and mu.status = 'pending');
