import { parsePublicEnv, type PublicEnv } from '@nookscanner/shared';

/**
 * Public configuration for the dashboard. Throws with a clear message when misconfigured or
 * when a privileged key was placed in a NEXT_PUBLIC_ variable (threat T06).
 */
export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
