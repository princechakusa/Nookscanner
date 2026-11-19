/**
 * Environment validation shared by the dashboard and guest apps.
 * Public (browser) configuration may contain ONLY the Supabase URL and the anon/publishable key.
 * Any value that looks like a privileged key is rejected so it can never be bundled into a client
 * (threat T06, docs/THREAT_MODEL.md).
 */
import { z } from 'zod';

export const APP_ENVS = ['local', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Decodes the role claim of a legacy Supabase JWT key without verifying it. */
function jwtRole(value: string): string | undefined {
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload: unknown = JSON.parse(json);
    if (payload && typeof payload === 'object' && 'role' in payload) {
      const role = (payload as { role: unknown }).role;
      return typeof role === 'string' ? role : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function looksLikePrivilegedKey(value: string): boolean {
  if (value.startsWith('sb_secret_')) return true;
  return jwtRole(value) === 'service_role';
}

const publicKey = z
  .string()
  .min(10)
  .refine((v) => !looksLikePrivilegedKey(v), {
    message: 'A privileged (service-role/secret) key must never be used in public configuration.',
  });

export const publicEnvSchema = z.object({
  appEnv: z.enum(APP_ENVS),
  supabaseUrl: z.url(),
  supabaseAnonKey: publicKey,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parsePublicEnv(raw: {
  appEnv: string | undefined;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
}): PublicEnv {
  const result = publicEnvSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid public environment configuration (${fields})`);
  }
  if (result.data.appEnv === 'production' && !result.data.supabaseUrl.startsWith('https://')) {
    throw new Error(
      'Invalid public environment configuration (supabaseUrl must use https in production)',
    );
  }
  return result.data;
}
