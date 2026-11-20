import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '../../../../../lib/org-context.ts';
import { VideoUploader, type UnfinishedUpload } from '../../../video-uploader.tsx';

export const metadata: Metadata = { title: 'Upload video' };

/** Method B (any device or camera): upload an existing walkthrough video (Stage 5.1). */
export default async function UploadVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { supabase, user, can } = await getOrgContext();

  const { data } = await supabase
    .from('apartments')
    .select('id, name')
    .eq('id', id.data)
    .maybeSingle();
  if (!data) notFound();
  const apartment = data as { id: string; name: string };

  // This person's unfinished uploads for the apartment (resumable with the same file).
  const { data: rows } = await supabase
    .from('media_uploads')
    .select('id, original_filename, size_bytes, created_at, scan_sessions!inner(apartment_id)')
    .eq('scan_sessions.apartment_id', apartment.id)
    .eq('status', 'pending')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(5);
  const unfinished: UnfinishedUpload[] = (
    (rows ?? []) as Array<{ id: string; original_filename: string; size_bytes: number }>
  ).map((r) => ({ id: r.id, filename: r.original_filename, sizeBytes: Number(r.size_bytes) }));

  return (
    <div className="ns-page">
      <h1 className="ns-page__title">Upload a walkthrough video</h1>
      <p className="ns-muted">
        For <Link href={`/app/apartments/${apartment.id}`}>{apartment.name}</Link>. Walk slowly
        through every room with the camera at chest height, keeping door frames in view between
        rooms.
      </p>
      <section className="ns-panel">
        {can('scan.create') ? (
          <VideoUploader apartmentId={apartment.id} unfinished={unfinished} />
        ) : (
          <p>Your role cannot upload videos. Ask a manager or admin.</p>
        )}
      </section>
    </div>
  );
}
