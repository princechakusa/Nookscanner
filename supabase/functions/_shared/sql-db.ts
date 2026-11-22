/**
 * PlatformDb over a direct Postgres connection (Edge Functions get SUPABASE_DB_URL; the private
 * schema is deliberately not exposed through the REST API). Works with `pg` and with PGlite.
 */
import type { InputRow, JobEvent, JobRow, PlatformDb } from './jobs.ts';

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const JOB_COLUMNS =
  'id, organization_id, apartment_id, scan_session_id, provider, status::text as status, attempt, parameters';

export function sqlPlatformDb(sql: Sql): PlatformDb {
  return {
    async getJob(id) {
      const { rows } = await sql.query<JobRow>(
        `select ${JOB_COLUMNS} from public.processing_jobs where id = $1::uuid`,
        [id],
      );
      return rows[0] ?? null;
    },

    async applyEvent(e: JobEvent) {
      const { rows } = await sql.query<{ applied: boolean }>(
        `select private.apply_job_event($1::uuid, $2::int, $3::text, $4::text, $5::numeric,
                                        $6::text, $7::text, $8::boolean, $9::jsonb) as applied`,
        [
          e.jobId,
          e.attempt,
          e.kind,
          e.stage ?? null,
          e.progress ?? null,
          e.errorCode ?? null,
          e.errorMessage ?? null,
          e.transient ?? false,
          e.report ? JSON.stringify(e.report) : null,
        ],
      );
      return rows[0]?.applied === true;
    },

    async claimJobs(limit) {
      const { rows } = await sql.query<JobRow>(
        `select ${JOB_COLUMNS} from private.claim_processing_jobs($1::int)`,
        [limit],
      );
      return rows;
    },

    async requeueStalled() {
      const { rows } = await sql.query<{ n: number }>(`select private.requeue_stalled_jobs() as n`);
      return Number(rows[0]?.n ?? 0);
    },

    async jobInputs(job) {
      const { rows } = await sql.query<{
        id: string;
        storage_backend: 'supabase' | 'r2';
        mime_type: InputRow['mime'];
        size_bytes: string | number;
        parts: Array<{ part_number: number; size_bytes: string | number; object_path: string }>;
      }>(
        `select mu.id, mu.storage_backend, mu.mime_type, mu.size_bytes,
                json_agg(json_build_object('part_number', p.part_number, 'size_bytes', p.size_bytes,
                                           'object_path', p.object_path)
                         order by p.part_number) as parts
         from public.media_uploads mu
         join public.media_upload_parts p on p.media_upload_id = mu.id and p.status = 'uploaded'
         where mu.scan_session_id = $1::uuid and mu.status in ('uploaded', 'validating', 'validated')
         group by mu.id, mu.storage_backend, mu.mime_type, mu.size_bytes, mu.created_at
         order by mu.created_at`,
        [job.scan_session_id],
      );
      return rows.map((r) => ({
        uploadId: r.id,
        backend: r.storage_backend ?? 'supabase',
        mime: r.mime_type,
        sizeBytes: Number(r.size_bytes),
        parts: r.parts.map((p) => ({
          partNumber: p.part_number,
          sizeBytes: Number(p.size_bytes),
          objectPath: p.object_path,
        })),
      }));
    },
  };
}
