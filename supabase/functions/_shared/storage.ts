/** PlatformStorage over Supabase Storage with the service role (Edge Functions only). */
import type { PlatformStorage } from './jobs.ts';

interface StorageBucketApi {
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
  createSignedUploadUrl(
    path: string,
    options?: { upsert: boolean },
  ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
}
interface StorageClient {
  storage: { from(bucket: string): StorageBucketApi };
}

/** R2 reads go through the uploads Worker (Stage 5.7, ADR-025); same HMAC as its handler. */
export interface R2ReadConfig {
  workerUrl: string;
  readSecret: string;
}

export async function signR2Read(
  config: R2ReadConfig,
  path: string,
  expiresInSeconds: number,
  nowMs = Date.now(),
): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + expiresInSeconds;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(config.readSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${path}:${exp}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const base = config.workerUrl.replace(/\/+$/, '');
  return `${base}/raw?path=${encodeURIComponent(path)}&exp=${exp}&sig=${hex}`;
}

export function supabaseStorage(client: StorageClient, r2?: R2ReadConfig): PlatformStorage {
  return {
    async signedDownloadUrl(path, expiresInSeconds, backend = 'supabase') {
      if (backend === 'r2') {
        if (!r2?.workerUrl || !r2.readSecret) throw new Error('R2_NOT_CONFIGURED');
        return signR2Read(r2, path, expiresInSeconds);
      }
      const { data, error } = await client.storage
        .from('raw-footage')
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw new Error('SIGNED_URL_FAILED');
      return data.signedUrl;
    },
    async signedUploadUrl(path) {
      // upsert: a retried attempt may re-upload the same file.
      const { data, error } = await client.storage
        .from('scene-drafts')
        .createSignedUploadUrl(path, { upsert: true });
      if (error || !data) throw new Error('SIGNED_URL_FAILED');
      return data.signedUrl;
    },
  };
}
