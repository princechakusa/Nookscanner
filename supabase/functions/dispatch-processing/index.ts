// Edge Function: dispatcher tick (called on a schedule with DISPATCH_SECRET). Logic: ../_shared/jobs.ts
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import pg from 'npm:pg@8.23.1';
import { handleDispatch } from '../_shared/jobs.ts';
import { sqlPlatformDb } from '../_shared/sql-db.ts';
import { supabaseStorage } from '../_shared/storage.ts';

const env = (name: string) => Deno.env.get(name) ?? '';
const pool = new pg.Pool({ connectionString: env('SUPABASE_DB_URL'), max: 3 });
const storage = supabaseStorage(
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')),
);

Deno.serve((req) =>
  handleDispatch(req, {
    db: sqlPlatformDb(pool),
    storage,
    secret: env('WORKER_HMAC_SECRET'),
    dispatchSecret: env('DISPATCH_SECRET'),
    workerUrl: env('WORKER_URL'),
    callbackUrl: `${env('SUPABASE_URL')}/functions/v1/job-callback`,
    fetch,
  }),
);
