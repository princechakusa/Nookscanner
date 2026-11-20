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

export function supabaseStorage(client: StorageClient): PlatformStorage {
  return {
    async signedDownloadUrl(path, expiresInSeconds) {
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
