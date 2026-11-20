-- =====================================================================================
-- Nookscanner Stage 6.2: reconstruction jobs, dispatch queue, callbacks and retries.
-- Members submit an uploaded scan (RPC) and read job status; everything else is the platform's
-- (service role: dispatcher and worker callbacks through Edge Functions). Retries: transient
-- failures re-queue with exponential back-off up to max_attempts; callbacks are idempotent per
-- (job, attempt) and progress never moves backwards (threat T09: replayed or stale callbacks).
-- =====================================================================================

create type public.job_status as enum ('queued', 'dispatched', 'running', 'succeeded', 'failed', 'cancelled');

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scan_session_id uuid not null references public.scan_sessions (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  provider text not null default 'self_hosted_gsplat'
    check (provider in ('self_hosted_gsplat', 'varjo_teleport')),
  status public.job_status not null default 'queued',
  attempt integer not null default 0 check (attempt between 0 and 10),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  stage text check (stage is null or char_length(stage) <= 40),
  progress numeric(5, 2) not null default 0 check (progress between 0 and 100),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{2,60}$'),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  next_attempt_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),
  dispatched_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_event_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index processing_jobs_queue_idx on public.processing_jobs (status, next_attempt_at);
create index processing_jobs_session_idx on public.processing_jobs (scan_session_id);
create index processing_jobs_apartment_idx on public.processing_jobs (apartment_id, created_at desc);
create index processing_jobs_organization_idx on public.processing_jobs (organization_id);
create index processing_jobs_created_by_idx on public.processing_jobs (created_by);

create trigger processing_jobs_set_updated_at before update on public.processing_jobs
  for each row execute function public.set_updated_at();
create trigger processing_jobs_prevent_org_change before update on public.processing_jobs
  for each row execute function public.prevent_org_change();
create trigger processing_jobs_audit after insert or update of status on public.processing_jobs
  for each row execute function public.audit_trigger();

create table public.processing_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  processing_job_id uuid not null unique references public.processing_jobs (id) on delete cascade,
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now()
);
create index processing_results_organization_idx on public.processing_results (organization_id);

alter table public.processing_jobs enable row level security;
alter table public.processing_results enable row level security;

create policy processing_jobs_select on public.processing_jobs for select to authenticated
  using (private.can_access_scan_session(scan_session_id, 'scan.read'));
create policy processing_results_select on public.processing_results for select to authenticated
  using (exists (
    select 1 from public.processing_jobs j
    where j.id = processing_job_id and private.can_access_scan_session(j.scan_session_id, 'scan.read')
  ));

revoke all on public.processing_jobs, public.processing_results from anon, authenticated;
grant select on public.processing_jobs, public.processing_results to authenticated;
grant all on public.processing_jobs, public.processing_results to service_role;

-- ---------- Member RPCs ------------------------------------------------------------------
-- Submit an uploaded scan for reconstruction. Idempotent: submitting again returns the open job.
create function public.submit_scan_for_processing(p_session uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.scan_sessions;
  v_job uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_session from public.scan_sessions s where s.id = p_session for update;
  if v_session.id is null or not coalesce(private.can_access_apartment(v_session.apartment_id, 'scan.create'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select j.id into v_job from public.processing_jobs j
  where j.scan_session_id = p_session and j.status in ('queued', 'dispatched', 'running');
  if v_job is not null then
    return v_job;
  end if;
  if v_session.status not in ('uploaded', 'submitted', 'failed')
     or not exists (select 1 from public.media_uploads mu where mu.scan_session_id = p_session and mu.status <> 'deleted')
     or exists (select 1 from public.media_uploads mu where mu.scan_session_id = p_session and mu.status = 'pending') then
    raise exception 'NOT_READY' using errcode = '55000';
  end if;
  insert into public.processing_jobs (organization_id, scan_session_id, apartment_id, idempotency_key, created_by)
  values (v_session.organization_id, p_session, v_session.apartment_id,
          p_session::text || ':' || (select count(*) + 1 from public.processing_jobs j where j.scan_session_id = p_session),
          (select auth.uid()))
  returning id into v_job;
  update public.scan_sessions set status = 'submitted', submitted_at = now() where id = p_session;
  return v_job;
end;
$$;

create function public.cancel_processing_job(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs;
begin
  select * into v_job from public.processing_jobs j where j.id = p_job for update;
  if v_job.id is null or not coalesce(private.can_access_scan_session(v_job.scan_session_id, 'scan.create'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.processing_jobs
  set status = 'cancelled', finished_at = now(), error_code = 'CANCELLED', error_message = null
  where id = p_job and status in ('queued', 'dispatched', 'running');
end;
$$;

revoke execute on function public.submit_scan_for_processing(uuid), public.cancel_processing_job(uuid) from public, anon;
grant execute on function public.submit_scan_for_processing(uuid), public.cancel_processing_job(uuid) to authenticated;

-- ---------- Platform functions (service role only; called by Edge Functions) --------------
-- Claims due jobs for dispatch without two dispatchers taking the same job.
create function private.claim_processing_jobs(p_limit integer default 1)
returns setof public.processing_jobs
language sql
security definer
set search_path = ''
as $$
  update public.processing_jobs j
  set status = 'dispatched', attempt = j.attempt + 1, dispatched_at = now(), stage = 'queued',
      progress = 0, error_code = null, error_message = null
  where j.id in (
    select id from public.processing_jobs
    where status = 'queued' and next_attempt_at <= now() and attempt < max_attempts
    order by next_attempt_at
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  )
  returning j.*;
$$;

-- Applies one worker event. Returns false (and changes nothing) for stale attempts, finished
-- jobs or progress that would move backwards, so replays and late callbacks are harmless.
create function private.apply_job_event(
  p_job uuid,
  p_attempt integer,
  p_kind text,
  p_stage text default null,
  p_progress numeric default null,
  p_error_code text default null,
  p_error_message text default null,
  p_transient boolean default false,
  p_report jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs;
begin
  select * into v_job from public.processing_jobs j where j.id = p_job for update;
  if v_job.id is null or v_job.attempt <> p_attempt
     or v_job.status not in ('dispatched', 'running') then
    return false;
  end if;
  if p_kind = 'progress' then
    if p_progress is null or p_progress < v_job.progress then
      return false;
    end if;
    update public.processing_jobs
    set status = 'running', stage = left(p_stage, 40), progress = least(p_progress, 99.99),
        started_at = coalesce(started_at, now()), last_event_at = now()
    where id = p_job;
    update public.scan_sessions set status = 'processing' where id = v_job.scan_session_id and status = 'submitted';
  elsif p_kind = 'succeeded' then
    if p_report is null or jsonb_typeof(p_report) <> 'object' then
      raise exception 'REPORT_REQUIRED' using errcode = '22023';
    end if;
    insert into public.processing_results (organization_id, processing_job_id, report)
    values (v_job.organization_id, p_job, p_report)
    on conflict (processing_job_id) do update set report = excluded.report;
    update public.processing_jobs
    set status = 'succeeded', stage = 'done', progress = 100, finished_at = now(), last_event_at = now()
    where id = p_job;
    update public.scan_sessions set status = 'succeeded' where id = v_job.scan_session_id;
  elsif p_kind = 'failed' then
    if p_transient and v_job.attempt < v_job.max_attempts then
      -- Back-off: 2, 4, 8 ... minutes.
      update public.processing_jobs
      set status = 'queued', next_attempt_at = now() + make_interval(mins => power(2, v_job.attempt)::int),
          error_code = left(p_error_code, 60), error_message = left(p_error_message, 500), last_event_at = now()
      where id = p_job;
    else
      update public.processing_jobs
      set status = 'failed', finished_at = now(), error_code = left(p_error_code, 60),
          error_message = left(p_error_message, 500), last_event_at = now()
      where id = p_job;
      update public.scan_sessions set status = 'failed' where id = v_job.scan_session_id;
    end if;
  else
    raise exception 'UNKNOWN_EVENT' using errcode = '22023';
  end if;
  return true;
end;
$$;

-- Jobs dispatched but silent for too long are treated as a transient failure (worker crash).
create function private.requeue_stalled_jobs(p_silence interval default interval '30 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_count integer := 0;
begin
  for v_job in
    select id, attempt from public.processing_jobs
    where status in ('dispatched', 'running') and coalesce(last_event_at, dispatched_at) < now() - p_silence
    for update skip locked
  loop
    perform private.apply_job_event(v_job.id, v_job.attempt, 'failed', null, null, 'WORKER_TIMEOUT',
                                    'The worker stopped reporting progress.', true, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function private.claim_processing_jobs(integer),
  private.apply_job_event(uuid, integer, text, text, numeric, text, text, boolean, jsonb),
  private.requeue_stalled_jobs(interval)
from public, anon, authenticated;
grant execute on function private.claim_processing_jobs(integer),
  private.apply_job_event(uuid, integer, text, text, numeric, text, text, boolean, jsonb),
  private.requeue_stalled_jobs(interval)
to service_role;
