import { EmptyState } from '@nookscanner/ui';

/** Placeholder content for sections whose features land in later roadmap stages. */
export function SectionPlaceholder({
  title,
  emptyTitle,
  body,
}: {
  title: string;
  emptyTitle: string;
  body: string;
}) {
  return (
    <div className="ns-page">
      <h1 className="ns-page__title">{title}</h1>
      <section className="ns-panel">
        <EmptyState title={emptyTitle} body={body} />
      </section>
    </div>
  );
}
