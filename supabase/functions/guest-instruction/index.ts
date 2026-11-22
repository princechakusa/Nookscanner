// Edge Function: guest-instruction (Stage 9.1, ADR-023). No login; QR token in the query string.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import pg from 'npm:pg@8.23.1';
import { handleGuestInstruction, sqlGuestDb, type GuestStorage } from '../_shared/guest.ts';

const env = (name: string) => Deno.env.get(name) ?? '';
const pool = new pg.Pool({ connectionString: env('SUPABASE_DB_URL'), max: 3 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const storage: GuestStorage = {
  async sign(bucket, path, seconds) {
    const { data } = await admin.storage.from(bucket).createSignedUrl(path, seconds);
    return data?.signedUrl ?? null;
  },
};

Deno.serve((req) =>
  handleGuestInstruction(req, {
    db: sqlGuestDb(pool),
    storage,
    // The guest app's origin (GUEST_ORIGIN secret); never '*'.
    allowedOrigin: env('GUEST_ORIGIN') || 'http://127.0.0.1:4173',
  }),
);
