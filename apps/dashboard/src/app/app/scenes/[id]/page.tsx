import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '../../../../lib/org-context.ts';
import { AlignTool } from './align-tool.tsx';

export const metadata: Metadata = { title: 'Align 3D apartment' };

interface SceneRow {
  id: string;
  version: number;
  status: string;
  scene_path: string | null;
  alignment: { matrix: number[]; scale: number } | null;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  start_view: { position: [number, number, number]; target: [number, number, number] } | null;
  apartments: { id: string; name: string } | null;
}

/** Stage 7.3: floor, scale and crop for one scene version (manager with scan.review). */
export default async function ScenePage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { supabase, can } = await getOrgContext();
  const { data } = await supabase
    .from('scene_versions')
    .select('id, version, status, scene_path, alignment, bounds, start_view, apartments(id, name)')
    .eq('id', id.data)
    .maybeSingle();
  if (!data) notFound();
  const scene = data as unknown as SceneRow;

  // Short-lived signed link (scene-drafts is private; storage RLS checks scan.read).
  const [{ data: roomRows }, { data: viewRows }, { data: doorRows }] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, name_en, room_type, sort_order')
      .eq('apartment_id', scene.apartments?.id ?? '')
      .order('sort_order'),
    supabase
      .from('scene_room_views')
      .select('room_id, position, target')
      .eq('scene_version_id', scene.id),
    supabase
      .from('scene_doorways')
      .select('room_a, room_b, position')
      .eq('scene_version_id', scene.id),
  ]);
  type V3 = [number, number, number];
  const rooms = ((roomRows ?? []) as { id: string; name_en: string; room_type: string }[]).map(
    (r) => ({ id: r.id, name: r.name_en, type: r.room_type }),
  );
  const views = ((viewRows ?? []) as { room_id: string; position: V3; target: V3 }[]).map((v) => ({
    roomId: v.room_id,
    position: v.position,
    target: v.target,
  }));
  const doorways = ((doorRows ?? []) as { room_a: string; room_b: string; position: V3 }[]).map(
    (d) => ({ a: d.room_a, b: d.room_b, position: d.position }),
  );

  let sceneUrl: string | null = null;
  if (scene.scene_path) {
    const { data: signed } = await supabase.storage
      .from('scene-drafts')
      .createSignedUrl(scene.scene_path, 3600);
    sceneUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="ns-page">
      <p className="ns-muted">
        {scene.apartments && (
          <Link href={`/app/apartments/${scene.apartments.id}`}>{scene.apartments.name}</Link>
        )}
        {` · 3D version ${scene.version}`}
      </p>
      <h1 className="ns-page__title">Align the 3D apartment</h1>
      <p className="ns-muted">
        Level the floor, set the real size with one measurement and mark the apartment&apos;s
        outline. Guests can then never fall through the floor or walk out through a wall.
      </p>
      {!sceneUrl ? (
        <p className="ns-field__error" role="alert">
          The 3D file of this version is not available.
        </p>
      ) : (
        <AlignTool
          sceneId={scene.id}
          sceneUrl={sceneUrl}
          canEdit={can('scan.review')}
          rooms={rooms}
          views={views}
          doorways={doorways}
          saved={
            scene.alignment && scene.bounds
              ? { alignment: scene.alignment, bounds: scene.bounds, start: scene.start_view }
              : null
          }
        />
      )}
    </div>
  );
}
