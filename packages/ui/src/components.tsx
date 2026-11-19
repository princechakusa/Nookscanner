'use client';

/**
 * Core UI components (docs/DESIGN_SYSTEM.md section 5). Styling lives in ui.css and uses only
 * design-token CSS variables. Logical CSS properties keep every component RTL-ready.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

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

// ---------------------------------------------------------------- Fields
interface FieldShellProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className={cx('ns-field', error && 'ns-field--invalid')}>
      <label className="ns-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="ns-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ns-field__error">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, id, className, ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error}>
      <input
        id={fieldId}
        className={cx('ns-input', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...rest}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function SelectField({
  label,
  hint,
  error,
  id,
  options,
  className,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error}>
      <select
        id={fieldId}
        className={cx('ns-input', 'ns-select', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

// ---------------------------------------------------------------- Modal
export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}

/**
 * Native <dialog> in modal mode: the browser provides the focus trap, inert background and Esc.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  closeLabel = 'Close',
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ns-modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="ns-modal__header">
        <h2 id={titleId} className="ns-modal__title">
          {title}
        </h2>
        <button type="button" className="ns-icon-btn" aria-label={closeLabel} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="ns-modal__body">{children}</div>
      {footer && <div className="ns-modal__footer">{footer}</div>}
    </dialog>
  );
}

// ---------------------------------------------------------------- Toasts
export type ToastTone = 'info' | 'success' | 'warning' | 'danger';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}
interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Toasts auto-dismiss after 5 s, except errors (DESIGN_SYSTEM section 5). */
export function ToastProvider({
  children,
  dismissLabel = 'Dismiss',
}: {
  children: ReactNode;
  dismissLabel?: string;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const remove = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = next.current++;
      setItems((all) => [...all, { id, tone, message }]);
      if (tone !== 'danger') setTimeout(() => remove(id), 5000);
    },
    [remove],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ns-toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('ns-toast', `ns-toast--${t.tone}`)}>
            <span>{t.message}</span>
            <button
              type="button"
              className="ns-icon-btn"
              aria-label={dismissLabel}
              onClick={() => remove(t.id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
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
