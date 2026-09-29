import { useEffect } from 'react';
import { toastDismissed } from '@/features/ui/uiSlice';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { cn } from '@/shared/lib';

const ICONS: Record<string, string> = {
  success: 'M5 13l4 4L19 7',
  error: 'M6 18 18 6M6 6l12 12',
  info: 'M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
};

const styles: Record<string, string> = {
  success: 'bg-white text-slate-800 ring-1 ring-slate-200',
  error: 'bg-white text-slate-800 ring-1 ring-red-200',
  info: 'bg-white text-slate-800 ring-1 ring-slate-200',
};

const iconStyles: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-600',
  error: 'bg-red-50 text-red-600',
  info: 'bg-brand-50 text-brand-600',
};

export function Toasts() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  const dispatch = useAppDispatch();

  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => dispatch(toastDismissed(t.id)), t.kind === 'error' ? 7000 : 4000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dispatch]);

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn('pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg', styles[t.kind])}
          role={t.kind === 'error' ? 'alert' : 'status'}
        >
          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', iconStyles[t.kind])} aria-hidden>
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none">
              <path d={ICONS[t.kind]} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="flex-1 pt-0.5 leading-snug">{t.message}</span>
          <button type="button" className="shrink-0 text-slate-400 hover:text-slate-700" onClick={() => dispatch(toastDismissed(t.id))} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" className="size-4" fill="none">
              <path d="M6 18 18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
