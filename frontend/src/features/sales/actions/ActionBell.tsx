import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib';
import { ActionList } from './ActionList';
import { useActionItems } from './useActionItems';

/** Top-bar "Action needed" (a clipboard; the bell is Notifications): what is waiting for you, on every page. */
export function ActionBell() {
  const { items, total, urgent } = useActionItems();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sm:relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-1.5 text-slate-600 hover:bg-white/60 hover:text-slate-900"
        aria-label={total ? `${total} things need your action` : 'Nothing needs your action'}
        title="Action needed"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
          <path
            d="M7.5 3.5h5M7 3h6a1 1 0 0 1 1 1v.5h1A1.5 1.5 0 0 1 16.5 6v10A1.5 1.5 0 0 1 15 17.5H5A1.5 1.5 0 0 1 3.5 16V6A1.5 1.5 0 0 1 5 4.5h1V4a1 1 0 0 1 1-1Zm0 8.5 2 2 4-4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {total > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] leading-4.5 font-semibold text-white tabular-nums',
              urgent ? 'bg-red-600' : 'bg-amber-500',
            )}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="surface absolute inset-x-0 top-full z-30 mt-2 !bg-white shadow-2xl shadow-slate-900/20 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain p-3 sm:inset-x-auto sm:right-0 sm:w-96"
        >
          <p className="mb-1 px-1 text-sm font-semibold text-slate-900">Action needed</p>
          {items.length ? (
            <ActionList items={items} onOpen={() => setOpen(false)} />
          ) : (
            <p className="px-1 py-3 text-sm text-slate-500">Nothing is waiting for you right now.</p>
          )}
        </div>
      )}
    </div>
  );
}
