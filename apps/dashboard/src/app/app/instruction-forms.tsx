'use client';

/** Stage 8.3 instruction editor (one form per language) and media uploader. */
import { Button, TextField } from '@nookscanner/ui';
import { useActionState, useState } from 'react';
import { message } from '../../lib/messages.ts';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser.ts';
import { addInstructionMediaAction, ensureInstructionAction } from './instruction-actions.ts';
import type { FormState } from './org-actions.ts';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
const initial: FormState = { status: 'idle' };
const PAIRS = 5;

export interface InstructionDraft {
  title: string;
  steps: string[];
  troubleshooting: { problem: string; solution: string }[];
  bodyMd: string | null;
}

export function InstructionForm({
  action,
  applianceId,
  locale,
  current,
}: {
  action: Action;
  applianceId: string;
  locale: 'en' | 'ar';
  current: InstructionDraft | null;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const ar = locale === 'ar';
  const p = `ins-${locale}`;
  const v = (k: string, saved: string) => state.values?.[k] ?? saved;
  const err = (k: string) => message(state.fieldErrors?.[k]);
  const label = ar ? 'Arabic' : 'English';
  return (
    <form
      action={formAction}
      className="ns-form ns-form--wide"
      noValidate
      aria-label={`Instructions in ${label}`}
    >
      <input type="hidden" name="applianceId" value={applianceId} />
      <input type="hidden" name="locale" value={locale} />
      <TextField
        id={`${p}-title`}
        name="title"
        label={`Title (${label})`}
        required
        maxLength={120}
        dir={ar ? 'rtl' : undefined}
        lang={locale}
        placeholder={ar ? 'تشغيل التبريد' : 'Turn on cooling'}
        defaultValue={v('title', current?.title ?? '')}
        error={err('title')}
      />
      <label className="ns-field" htmlFor={`${p}-steps`}>
        <span className="ns-field__label">Steps, one per line ({label})</span>
        <textarea
          id={`${p}-steps`}
          name="steps"
          className="ns-input ns-textarea"
          rows={6}
          dir={ar ? 'rtl' : undefined}
          lang={locale}
          defaultValue={v('steps', current?.steps.join('\n') ?? '')}
          aria-invalid={err('steps') ? true : undefined}
        />
        <span className="ns-field__hint">
          **bold**, *italic* and [links](https://…) work; nothing else is formatted.
        </span>
        {err('steps') && <span className="ns-field__error">{err('steps')}</span>}
      </label>
      <fieldset className="ns-fieldset">
        <legend>Troubleshooting ({label}, optional)</legend>
        {Array.from({ length: PAIRS }, (_, i) => (
          <div key={i} className="ns-form__row">
            <TextField
              id={`${p}-problem${i}`}
              name={`problem${i}`}
              label={`Problem ${i + 1}`}
              maxLength={300}
              dir={ar ? 'rtl' : undefined}
              lang={locale}
              defaultValue={v(`problem${i}`, current?.troubleshooting[i]?.problem ?? '')}
            />
            <TextField
              id={`${p}-solution${i}`}
              name={`solution${i}`}
              label={`Solution ${i + 1}`}
              maxLength={1000}
              dir={ar ? 'rtl' : undefined}
              lang={locale}
              defaultValue={v(`solution${i}`, current?.troubleshooting[i]?.solution ?? '')}
            />
          </div>
        ))}
        {err('troubleshooting') && (
          <span className="ns-field__error">{err('troubleshooting')}</span>
        )}
      </fieldset>
      <label className="ns-field" htmlFor={`${p}-body`}>
        <span className="ns-field__label">More information ({label}, optional)</span>
        <textarea
          id={`${p}-body`}
          name="bodyMd"
          className="ns-input ns-textarea"
          rows={3}
          maxLength={5000}
          dir={ar ? 'rtl' : undefined}
          lang={locale}
          defaultValue={v('bodyMd', current?.bodyMd ?? '')}
        />
      </label>
      {state.formError && (
        <p className="ns-field__error" role="alert">
          {message(state.formError)}
        </p>
      )}
      {state.status === 'done' && (
        <p className="ns-notice" role="status">
          Saved as a new {label} version. It needs verification before guests see it.
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          Save {label} instructions
        </Button>
      </div>
    </form>
  );
}

const TYPES: Record<string, { kind: 'image' | 'video'; ext: string }> = {
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/png': { kind: 'image', ext: 'png' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/quicktime': { kind: 'video', ext: 'mov' },
};
// Supabase Free: 50 MB per file (ADR-016).
const MAX_BYTES = 50 * 1024 * 1024;

export function MediaUploader({
  applianceId,
  organizationId,
  apartmentId,
}: {
  applianceId: string;
  organizationId: string;
  apartmentId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  async function upload(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setMsg({ kind: 'error', text: 'Choose a photo or a video.' });
      return;
    }
    const type = TYPES[file.type];
    if (!type) {
      setMsg({ kind: 'error', text: 'Use a JPEG, PNG or WebP photo, or an MP4 or MOV video.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMsg({ kind: 'error', text: 'The file is larger than 50 MB. Use a shorter video.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const ins = await ensureInstructionAction(applianceId);
      if (!ins.ok) throw new Error('FORBIDDEN');
      const path = `org/${organizationId}/apartments/${apartmentId}/instructions/${ins.id}/${crypto.randomUUID()}.${type.ext}`;
      const supabase = createSupabaseBrowserClient();
      const up = await supabase.storage
        .from('instruction-media')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const caption = (k: string) => {
        const c = data.get(k);
        return typeof c === 'string' && c.trim() ? c.trim() : null;
      };
      const saved = await addInstructionMediaAction({
        applianceId,
        instructionId: ins.id,
        objectPath: path,
        kind: type.kind,
        sizeBytes: file.size,
        captionEn: caption('captionEn'),
        captionAr: caption('captionAr'),
      });
      if (!saved.ok) {
        await supabase.storage.from('instruction-media').remove([path]);
        throw new Error(saved.error);
      }
      form.reset();
      setMsg({ kind: 'ok', text: `${file.name} added.` });
    } catch {
      setMsg({ kind: 'error', text: 'The upload did not work. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="ns-form ns-form--wide"
      aria-label="Add photo or video"
      onSubmit={(e) => {
        e.preventDefault();
        void upload(e.currentTarget);
      }}
    >
      <label className="ns-field" htmlFor="media-file">
        <span className="ns-field__label">Photo or short video (up to 50 MB)</span>
        <input
          id="media-file"
          name="file"
          type="file"
          className="ns-input"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        />
      </label>
      <div className="ns-form__row">
        <TextField id="media-cap-en" name="captionEn" label="Caption (English)" maxLength={200} />
        <TextField
          id="media-cap-ar"
          name="captionAr"
          label="Caption (Arabic)"
          maxLength={200}
          dir="rtl"
          lang="ar"
        />
      </div>
      {msg && (
        <p
          className={msg.kind === 'error' ? 'ns-field__error' : 'ns-notice'}
          role={msg.kind === 'error' ? 'alert' : 'status'}
        >
          {msg.text}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" loading={busy}>
          Upload
        </Button>
      </div>
    </form>
  );
}
