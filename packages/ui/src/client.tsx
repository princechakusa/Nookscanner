'use client';

/** Hook-based UI components (fields with generated ids, Modal, toasts). */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

import { cx } from './components.tsx';

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
