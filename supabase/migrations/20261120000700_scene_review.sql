-- =====================================================================================
-- Nookscanner Stage 6.3: manager review of a reconstruction's quality report
-- (docs/3D_QUALITY_BAR.md sections 4 and 7; product rule 8: the manager reviews before publishing).
-- The worker's report (metrics) is immutable; the review (decision, artefact checklist, notes) is
-- recorded once per result by a member with scan.review and is audited.
-- =====================================================================================

create type public.review_status as enum ('pending_review', 'approved', 'rejected');

alter table public.processing_results
  add column review_status public.review_status not null default 'pending_review',
  add column checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  add column review_notes text check (review_notes is null or char_length(review_notes) <= 2000),
  add column reviewed_by uuid references auth.users (id) on delete set null,
  add column reviewed_at timestamptz,
  add constraint processing_results_review_consistent
    check ((review_status = 'pending_review') = (reviewed_at is null));

create index processing_results_reviewed_by_idx on public.processing_results (reviewed_by);

create trigger processing_results_audit after insert or update on public.processing_results
  for each row execute function public.audit_trigger();

-- Artefact checklist keys (DESIGN: 3D_QUALITY_BAR section 4). true = problem present.
create function private.valid_checklist(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) e
      where e.key not in ('floaters', 'holes', 'smeared_walls', 'mirror_ghosting', 'blown_windows',
                          'doorway_seams', 'missing_rooms', 'personal_items')
         or jsonb_typeof(e.value) <> 'boolean'
    );
$$;

create function public.review_processing_result(
  p_job uuid,
  p_decision public.review_status,
  p_checklist jsonb,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_job from public.processing_jobs j where j.id = p_job;
  if v_job.id is null or not coalesce(private.can_access_scan_session(v_job.scan_session_id, 'scan.review'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_job.status <> 'succeeded' then
    raise exception 'NOT_READY' using errcode = '55000';
  end if;
  if p_decision not in ('approved', 'rejected') or not private.valid_checklist(coalesce(p_checklist, '{}'::jsonb)) then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;
  -- Rejecting needs a reason the capture team can act on.
  if p_decision = 'rejected' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'NOTES_REQUIRED' using errcode = '22023';
  end if;
  update public.processing_results
  set review_status = p_decision, checklist = coalesce(p_checklist, '{}'::jsonb),
      review_notes = nullif(left(btrim(p_notes), 2000), ''), reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where processing_job_id = p_job;
end;
$$;

revoke execute on function public.review_processing_result(uuid, public.review_status, jsonb, text)
  from public, anon;
grant execute on function public.review_processing_result(uuid, public.review_status, jsonb, text)
  to authenticated;
revoke execute on function private.valid_checklist(jsonb) from public, anon;
grant execute on function private.valid_checklist(jsonb) to authenticated, service_role;
