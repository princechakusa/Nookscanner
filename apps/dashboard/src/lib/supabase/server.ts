import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPublicEnv } from '../env.ts';

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Uses the user's session from httpOnly cookies and the public anon key only; all authorization
 * is enforced by RLS. The service-role key is never used in the dashboard.
 * Not wired to any page yet: authentication flows are Phase 2 (stage 2.4).
 */
export async function createSupabaseServerClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; middleware refreshes them.
        }
      },
    },
  });
}
