import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, Loader2, MinusCircle, X, XCircle } from 'lucide-react';
import type { ResultStatus, RunStatus } from '../types';

type AnyStatus = RunStatus | ResultStatus;

const STATUS: Record<AnyStatus, { label: string; cls: string; Icon: typeof CheckCircle2; spin?: boolean }> = {
  PASSED: { label: 'Passed', cls: 'bg-good-soft text-good-ink', Icon: CheckCircle2 },
  FAILED: { label: 'Failed', cls: 'bg-bad-soft text-bad-ink', Icon: XCircle },
  ERROR: { label: 'Error', cls: 'bg-bad-soft text-bad-ink', Icon: AlertTriangle },
  SKIPPED: { label: 'Skipped', cls: 'bg-skip-soft text-ink-2', Icon: MinusCircle },
  CANCELLED: { label: 'Cancelled', cls: 'bg-skip-soft text-ink-2', Icon: Ban },
  QUEUED: { label: 'Queued', cls: 'bg-surface-2 text-ink-2', Icon: Clock },
  PENDING: { label: 'Pending', cls: 'bg-surface-2 text-ink-2', Icon: CircleDashed },
  RUNNING: { label: 'Running', cls: 'bg-primary-soft text-primary', Icon: Loader2, spin: true },
};

/** Status is always shown as icon + label, never colour alone */
export function StatusBadge({ status, size = 'md' }: { status: AnyStatus; size?: 'sm' | 'md' }) {
  const s = STATUS[status] ?? STATUS.PENDING;
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full font-medium', s.cls, size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs')}>
      <s.Icon className={clsx(size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5', s.spin && 'animate-spin')} aria-hidden />
      {s.label}
    </span>
  );
}

export function StatusIcon({ status, className }: { status: AnyStatus; className?: string }) {
  const s = STATUS[status] ?? STATUS.PENDING;
  const color = { PASSED: 'text-good', FAILED: 'text-bad', ERROR: 'text-bad', RUNNING: 'text-primary' }[status as string] ?? 'text-ink-3';
  return <s.Icon className={clsx('h-4 w-4 shrink-0', color, s.spin && 'animate-spin', className)} aria-label={s.label} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-ink-3', className)} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="mb-6">
      {breadcrumb && <div className="mb-2 text-sm text-ink-3">{breadcrumb}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink break-words">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-ink-2">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <h3 className="font-medium text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx('card flex max-h-[92vh] w-full flex-col shadow-xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Two-step inline confirmation (avoids blocking browser dialogs) */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirm', className = 'btn-secondary btn-sm', disabled, title }: { onConfirm: () => void; children: ReactNode; confirmLabel?: string; className?: string; disabled?: boolean; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button className="btn-danger btn-sm" onClick={() => { setArmed(false); onConfirm(); }}>
      {confirmLabel}
    </button>
  ) : (
    <button className={className} onClick={() => setArmed(true)} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 mb-6 overflow-x-auto overflow-y-hidden [scrollbar-width:none] border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist">
      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={value === t.key}
            onClick={() => onChange(t.key)}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              value === t.key ? 'border-primary text-ink' : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className={clsx('mt-1.5 text-2xl font-semibold tabular-nums', tone === 'good' && 'text-good-ink', tone === 'bad' && 'text-bad-ink')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Field({ label, children, hint, error, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; error?: string; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {error && <p className="mt-1 text-xs text-bad-ink">{error}</p>}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad-ink">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

const BROWSER_LABEL = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' } as const;
export function BrowserTag({ browser }: { browser: keyof typeof BROWSER_LABEL }) {
  return <span className="inline-flex items-center rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-2">{BROWSER_LABEL[browser] ?? browser}</span>;
}

export function PriorityTag({ priority }: { priority: string }) {
  const cls = { CRITICAL: 'text-bad-ink border-bad/40', HIGH: 'text-warn-ink border-warn/50', MEDIUM: 'text-ink-2 border-line', LOW: 'text-ink-3 border-line' }[priority] ?? '';
  return <span className={clsx('inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium', cls)}>{priority.toLowerCase()}</span>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-primary' : 'bg-line-strong')}
    >
      <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

/** Pass/fail/skip proportion bar with an accessible text equivalent */
export function ResultBar({ passed, failed, skipped, total }: { passed: number; failed: number; skipped: number; total: number }) {
  const t = Math.max(total, 1);
  const pending = Math.max(total - passed - failed - skipped, 0);
  return (
    <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${passed} passed, ${failed} failed, ${skipped} skipped, ${pending} pending`}>
      {passed > 0 && <div className="bg-good" style={{ width: `${(passed / t) * 100}%` }} />}
      {failed > 0 && <div className="bg-bad" style={{ width: `${(failed / t) * 100}%` }} />}
      {skipped > 0 && <div className="bg-skip" style={{ width: `${(skipped / t) * 100}%` }} />}
    </div>
  );
}
