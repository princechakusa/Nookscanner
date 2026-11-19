'use client';
import { createBrowserClient } from '@supabase/ssr';
import { getPublicEnv } from '../env.ts';

/** Browser Supabase client (anon key + user session). Used from Phase 2 onward. */
export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
