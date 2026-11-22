// Edge Function: delete-account (Stage 10.6). The caller's session identifies the user.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import pg from 'npm:pg@8.23.1';
import { handleDeleteAccount, sqlAccountDb } from '../_shared/account.ts';

const env = (name: string) => Deno.env.get(name) ?? '';
const pool = new pg.Pool({ connectionString: env('SUPABASE_DB_URL'), max: 2 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});
const db = sqlAccountDb(pool);

Deno.serve((req) =>
  handleDeleteAccount(req, {
    async userFromToken(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    blockers: db.blockers,
    record: db.record,
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    // Dashboard origins (the /account/delete page, S4); the app calls without an Origin.
    allowedOrigins: (
      env('DASHBOARD_ORIGINS') || 'http://localhost:3000,http://localhost:3001'
    ).split(','),
  }),
);
