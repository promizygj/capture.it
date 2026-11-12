import clsx from 'clsx';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store';
import { toastDismissed } from '../store/uiSlice';

export function Toasts() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  const dispatch = useAppDispatch();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : Info;
        return (
          <div key={t.id} className="card pointer-events-auto flex w-full max-w-sm items-start gap-2.5 px-4 py-3 shadow-lg">
            <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', t.kind === 'success' ? 'text-good' : t.kind === 'error' ? 'text-bad' : 'text-primary')} />
            <p className="flex-1 text-sm">{t.message}</p>
            <button onClick={() => dispatch(toastDismissed(t.id))} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
