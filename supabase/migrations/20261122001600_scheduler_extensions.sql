-- =====================================================================================
-- Nookscanner: scheduler extensions for the processing dispatcher (Stage 6.2/6.8, DEPLOYMENT 3).
-- pg_cron runs the schedule, pg_net makes the HTTP call. The job itself (project URL + a Vault
-- secret reference) is environment-specific and created once per environment (DEPLOYMENT.md).
-- Guarded: test databases without these extensions (PGlite) skip them.
-- =====================================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;
