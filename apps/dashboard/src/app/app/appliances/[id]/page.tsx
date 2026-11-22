import { Markdown } from '@nookscanner/ui/markdown';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '../../../../lib/org-context.ts';
import { deleteInstructionMediaAction, saveInstructionAction } from '../../instruction-actions.ts';
import { InstructionForm, MediaUploader, type InstructionDraft } from '../../instruction-forms.tsx';

export const metadata: Metadata = { title: 'Appliance instructions' };

interface VersionRow {
  locale: 'en' | 'ar';
  version: number;
  title: string;
  steps: { text: string }[];
  troubleshooting: { problem: string; solution: string }[];
  body_md: string | null;
  verification_status: string;
  created_at: string;
}
interface MediaRow {
  id: string;
  kind: 'image' | 'video';
  object_path: string;
  caption_en: string | null;
  caption_ar: string | null;
}

/** Stage 8.3: instructions (EN/AR, versioned) and media of one appliance. */
export default async function ApplianceInstructionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { supabase, can } = await getOrgContext();
  const { data } = await supabase
    .from('appliances')
    .select(
      'id, organization_id, apartment_id, name_en, brand, model_number, apartments(id, name), rooms(name_en)',
    )
    .eq('id', id.data)
    .maybeSingle();
  if (!data) notFound();
  const appliance = data as unknown as {
    id: string;
    organization_id: string;
    apartment_id: string;
    name_en: string;
    brand: string | null;
    model_number: string | null;
    apartments: { id: string; name: string } | null;
    rooms: { name_en: string } | null;
  };
  const { data: ins } = await supabase
    .from('instructions')
    .select('id')
    .eq('appliance_id', appliance.id)
    .maybeSingle();
  const instructionId = (ins as { id: string } | null)?.id ?? null;
  const [{ data: versionRows }, { data: mediaRows }] = instructionId
    ? await Promise.all([
        supabase
          .from('instruction_versions')
          .select(
            'locale, version, title, steps, troubleshooting, body_md, verification_status, created_at',
          )
          .eq('instruction_id', instructionId)
          .order('version', { ascending: false }),
        supabase
          .from('instruction_media')
          .select('id, kind, object_path, caption_en, caption_ar')
          .eq('instruction_id', instructionId)
          .order('created_at'),
      ])
    : [{ data: [] }, { data: [] }];
  const versions = (versionRows ?? []) as VersionRow[];
  const latest = (locale: 'en' | 'ar') => versions.find((v) => v.locale === locale) ?? null;
  const draft = (v: VersionRow | null): InstructionDraft | null =>
    v
      ? {
          title: v.title,
          steps: v.steps.map((s) => s.text),
          troubleshooting: v.troubleshooting,
          bodyMd: v.body_md,
        }
      : null;
  const media = (mediaRows ?? []) as MediaRow[];
  // Short-lived signed links for previews (private bucket, storage RLS).
  const signed = new Map<string, string>();
  if (media.length > 0) {
    const { data: urls } = await supabase.storage.from('instruction-media').createSignedUrls(
      media.map((m) => m.object_path),
      600,
    );
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const canWrite = can('instruction.write');

  return (
    <div className="ns-page">
      <p className="ns-muted">
        {appliance.apartments && (
          <Link href={`/app/apartments/${appliance.apartments.id}`}>
            {appliance.apartments.name}
          </Link>
        )}
        {appliance.rooms && ` · ${appliance.rooms.name_en}`}
      </p>
      <h1 className="ns-page__title">{appliance.name_en}</h1>
      {(appliance.brand || appliance.model_number) && (
        <p className="ns-muted">
          {[appliance.brand, appliance.model_number].filter(Boolean).join(' · ')}
        </p>
      )}

      {(['en', 'ar'] as const).map((locale) => {
        const current = latest(locale);
        const label = locale === 'en' ? 'English' : 'Arabic';
        const count = versions.filter((v) => v.locale === locale).length;
        return (
          <section key={locale} className="ns-panel" aria-labelledby={`ins-${locale}-h`}>
            <h2 id={`ins-${locale}-h`} className="ns-panel__title">
              {label} instructions
            </h2>
            {current ? (
              <div
                lang={locale}
                dir={locale === 'ar' ? 'rtl' : undefined}
                data-testid={`preview-${locale}`}
              >
                <p className="ns-muted">
                  Version {current.version} of {count} ·{' '}
                  {current.verification_status === 'verified' ? 'verified' : 'not verified yet'}
                </p>
                <h3 className="ns-panel__subtitle">{current.title}</h3>
                <ol className="ns-steps">
                  {current.steps.map((s, i) => (
                    <li key={i}>
                      <Markdown source={s.text} inline />
                    </li>
                  ))}
                </ol>
                {current.troubleshooting.length > 0 && (
                  <dl className="ns-trouble">
                    {current.troubleshooting.map((t, i) => (
                      <div key={i}>
                        <dt>{t.problem}</dt>
                        <dd>
                          <Markdown source={t.solution} inline />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {current.body_md && <Markdown source={current.body_md} />}
              </div>
            ) : (
              <p className="ns-muted">No {label} instructions yet.</p>
            )}
            {canWrite && (
              <details className="ns-rooms__edit" open={!current}>
                <summary>
                  {current ? `Edit ${label} instructions` : `Write ${label} instructions`}
                </summary>
                <InstructionForm
                  action={saveInstructionAction}
                  applianceId={appliance.id}
                  locale={locale}
                  current={draft(current)}
                />
              </details>
            )}
          </section>
        );
      })}

      <section className="ns-panel" aria-labelledby="media-h">
        <h2 id="media-h" className="ns-panel__title">
          Photos and videos
        </h2>
        {media.length === 0 ? (
          <p className="ns-muted">A photo of the remote or a 20-second video helps guests most.</p>
        ) : (
          <ul className="ns-media" aria-label="Instruction media">
            {media.map((m) => {
              const url = signed.get(m.object_path);
              const caption = m.caption_en ?? m.caption_ar ?? '';
              return (
                <li key={m.id} className="ns-media__item">
                  {url &&
                    (m.kind === 'image' ? (
                      <img
                        src={url}
                        alt={caption || 'Instruction photo'}
                        className="ns-media__thumb"
                      />
                    ) : (
                      <video src={url} controls preload="metadata" className="ns-media__thumb" />
                    ))}
                  <span>{caption}</span>
                  {canWrite && (
                    <form action={deleteInstructionMediaAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="applianceId" value={appliance.id} />
                      <button
                        type="submit"
                        className="ns-btn ns-btn--ghost ns-btn--sm"
                        aria-label={`Delete ${caption || m.kind}`}
                      >
                        Delete
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canWrite && (
          <MediaUploader
            applianceId={appliance.id}
            organizationId={appliance.organization_id}
            apartmentId={appliance.apartment_id}
          />
        )}
      </section>
    </div>
  );
}
