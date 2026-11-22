// Edge Function: worker callbacks (progress, upload URLs, success, failure). Logic: ../_shared/jobs.ts
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import pg from 'npm:pg@8.23.1';
import { handleJobCallback } from '../_shared/jobs.ts';
import { sqlPlatformDb } from '../_shared/sql-db.ts';
import { supabaseStorage } from '../_shared/storage.ts';

const env = (name: string) => Deno.env.get(name) ?? '';
const pool = new pg.Pool({ connectionString: env('SUPABASE_DB_URL'), max: 3 });
const storage = supabaseStorage(
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')),
  // Raw footage on R2 is read through the uploads Worker (Stage 5.7).
  { workerUrl: env('R2_WORKER_URL'), readSecret: env('RAW_READ_SECRET') },
);

Deno.serve((req) =>
  handleJobCallback(req, { db: sqlPlatformDb(pool), storage, secret: env('WORKER_HMAC_SECRET') }),
);
