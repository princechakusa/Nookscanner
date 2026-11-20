/**
 * Server-safe UI components (no hooks): usable from React Server Components with function props
 * such as DataTable column renderers. Hook-based components live in client.tsx.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------- Button
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('ns-btn', `ns-btn--${variant}`, `ns-btn--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ns-spinner ns-spinner--inline" aria-hidden="true" />}
      <span className={cx(loading && 'ns-btn__label--loading')}>{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------- Status pill
export type Status = 'draft' | 'processing' | 'review' | 'published' | 'failed';
const STATUS_TONE: Record<Status, string> = {
  draft: 'neutral',
  processing: 'info',
  review: 'warning',
  published: 'success',
  failed: 'danger',
};

export function StatusPill({ status, label }: { status: Status; label: string }) {
  return (
    <span className={cx('ns-pill', `ns-pill--${STATUS_TONE[status]}`)}>
      {status === 'processing' && <span className="ns-pill__dot" aria-hidden="true" />}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------- Table
export interface Column<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  caption: string;
  columns: ReadonlyArray<Column<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  empty?: ReactNode;
}

/** 48 px rows, sticky header; becomes a stacked list below the md breakpoint (CSS). */
export function DataTable<Row>({ caption, columns, rows, rowKey, empty }: DataTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="ns-table-wrap">
      <table className="ns-table">
        <caption className="ns-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- States
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ns-state">
      <svg className="ns-state__art" viewBox="0 0 64 48" aria-hidden="true">
        <path d="M8 44V20L32 6l24 14v24" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M26 44V30h12v14" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <h2 className="ns-state__title">{title}</h2>
      {body && <p className="ns-state__body">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  code,
  onRetry,
  retryLabel = 'Try again',
}: {
  title: string;
  body: string;
  code?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="ns-state ns-state--error" role="alert">
      <h2 className="ns-state__title">{title}</h2>
      <p className="ns-state__body">{body}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
      {code && <p className="ns-state__code">Code: {code}</p>}
    </div>
  );
}

export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div className="ns-skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="ns-skeleton__line" />
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="ns-spinner" role="status" aria-label={label} />;
}
