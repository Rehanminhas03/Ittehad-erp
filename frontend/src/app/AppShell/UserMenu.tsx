import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { DEV_AUTO_LOGIN } from '@/features/auth';
import { useAuth } from '@/shared/hooks';
import { cn } from '@/shared/lib';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Avatar + name, opening a small menu with account settings and sign-out. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm hover:bg-slate-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {initialsOf(user.fullName)}
        </span>
        <span className="hidden font-medium text-slate-800 sm:inline">{user.fullName}</span>
        <svg viewBox="0 0 16 16" className={cn('hidden size-3.5 text-slate-400 transition-transform sm:block', open && 'rotate-180')} fill="none" aria-hidden>
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="surface absolute right-0 z-20 mt-2 w-56 overflow-hidden py-1.5">
          <div className="border-b border-slate-100 px-3.5 py-2.5">
            <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link
            to="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg viewBox="0 0 20 20" className="size-4 text-slate-400" fill="none" aria-hidden>
              <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3.5 17c1-3.5 4-5 6.5-5s5.5 1.5 6.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            My account
          </Link>
          <Link
            to="/activity"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg viewBox="0 0 20 20" className="size-4 text-slate-400" fill="none" aria-hidden>
              <path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm0-11.5v4l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            My activity
          </Link>
          {/* No sign-out in development auto sign-in: the user switcher replaces it. */}
          {!DEV_AUTO_LOGIN && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                // Straight to the login page (not back to this page after the next sign-in).
                void logout().then(() => navigate('/login', { replace: true }));
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <svg viewBox="0 0 20 20" className="size-4 text-slate-400" fill="none" aria-hidden>
                <path d="M7.5 17.5H4.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1h3M13.5 14l3.5-4-3.5-4M17 10H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
