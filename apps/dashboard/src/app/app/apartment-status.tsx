import { StatusPill, type Status } from '@nookscanner/ui';

/** Maps `apartment_status` (DB enum) onto the design system's status pill tones. */
const STATUS: Record<string, { tone: Status; label: string }> = {
  draft: { tone: 'draft', label: 'Draft' },
  capturing: { tone: 'processing', label: 'Capturing' },
  processing: { tone: 'processing', label: 'Processing' },
  review: { tone: 'review', label: 'In review' },
  published: { tone: 'published', label: 'Published' },
  archived: { tone: 'draft', label: 'Archived' },
};

export function ApartmentStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: 'draft' as Status, label: status };
  return <StatusPill status={s.tone} label={s.label} />;
}
