import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useGetUnreadNotificationCountQuery } from '@/features/notifications';
import { setMobileNavOpen } from '@/features/ui/uiSlice';
import { useAppDispatch, useAppSelector, usePermission } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { NAVIGATION } from '../navigation';
import { NavIcon } from './navIcons';

/** Ittehad Automotive logo from public/logo, or a text mark until it loads. */
function BrandMark() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-16 items-center gap-3 px-5">
      {failed ? (
        <span className="text-sm font-semibold tracking-tight text-slate-900">Ittehad Automotive</span>
      ) : (
        <img src="/logo/Ittehad-logo.png" alt="Ittehad Automotive" className="h-9 w-auto" onError={() => setFailed(true)} />
      )}
      <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-brand-700 uppercase">DMS</span>
    </div>
  );
}

/**
 * The one menu item to highlight for the current page. Links that differ only by a filter (e.g.
 * Leads and Duplicate customers = /sales/leads?escalated=true) share a path, so the best match wins:
 * a link whose filter matches the address beats a plain link, and a longer path beats a shorter one.
 */
export function activeNavItem(links: string[], pathname: string, search: string): string | null {
  const current = new URLSearchParams(search);
  let best: { to: string; score: number } | null = null;
  for (const to of links) {
    const [path, query = ''] = to.split('?');
    // The period (`range`) is only the link's starting view, not what the page is.
    const params = [...new URLSearchParams(query)].filter(([k]) => k !== 'range');
    const exact = pathname === path;
    const within = path !== '/' && pathname.startsWith(`${path}/`);
    if (!exact && !within) continue;
    if (params.length && (!exact || !params.every(([k, v]) => current.get(k) === v))) continue;
    const score = path!.length * 10 + (params.length ? 5 : 0) + (exact ? 1 : 0);
    if (!best || score > best.score) best = { to, score };
  }
  return best?.to ?? null;
}

/** "Notifications" with the unread count (updated live). */
function NotificationsLabel({ label }: { label: string }) {
  const { data } = useGetUnreadNotificationCountQuery();
  const n = data?.unread ?? 0;
  return (
    <span className="flex items-center justify-between gap-2">
      {label}
      {n > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">{n > 99 ? '99+' : n}</span>}
    </span>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const perm = usePermission();
  const location = useLocation();
  const sections = NAVIGATION.map((s) => ({ ...s, items: s.items.filter((i) => !i.any.length || perm.can(i.any)) })).filter(
    (s) => s.items.length,
  );
  const active = activeNavItem(sections.flatMap((s) => s.items.map((i) => i.to)), location.pathname, location.search);
  return (
    <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 pt-2 pb-4" aria-label="Main">
      {sections.map((s) => (
        <div key={s.title}>
          <div className="mb-1.5 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            <NavIcon title={s.title} className="size-3.5" />
            {s.title}
          </div>
          <ul className="space-y-0.5">
            {s.items.map((i) => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  end={i.to === '/' || i.to.includes('?')}
                  onClick={onNavigate}
                  aria-current={active === i.to ? 'page' : undefined}
                  className={() =>
                    cn(
                      'block rounded-xl px-3 py-2 text-sm transition',
                      active === i.to
                        ? 'bg-white/85 font-semibold text-brand-700 shadow-[0_4px_14px_-6px_rgba(30,58,138,0.35)] ring-1 ring-white'
                        : 'text-slate-700 hover:bg-white/50 hover:text-slate-900',
                    )
                  }
                >
                  {i.to === '/notifications' ? <NotificationsLabel label={i.label} /> : i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Glass navigation. Desktop: a floating panel that collapses from the top bar. Phones and tablets:
 * a drawer that slides over the page and closes on navigation, on the backdrop, or with Escape.
 */
export function Sidebar() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.sidebarOpen);
  const mobileOpen = useAppSelector((s) => s.ui.mobileNavOpen);
  const location = useLocation();
  const close = () => dispatch(setMobileNavOpen(false));

  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop */}
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 p-3 pr-0 transition-all lg:block', open ? 'w-72' : 'w-0 overflow-hidden p-0')}>
        <div className="glass flex h-full flex-col rounded-3xl">
          <BrandMark />
          <NavList />
        </div>
      </aside>

      {/* Phones / tablets */}
      <div className={cn('fixed inset-0 z-40 lg:hidden', mobileOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!mobileOpen}>
        <div
          className={cn('absolute inset-0 bg-slate-900/25 backdrop-blur-[2px] transition-opacity', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={close}
        />
        <aside
          className={cn(
            'glass absolute inset-y-2 left-2 flex w-[min(18rem,calc(100vw-3rem))] flex-col rounded-3xl transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-[110%]',
          )}
          aria-label="Navigation"
        >
          <div className="flex items-center justify-between pr-3">
            <BrandMark />
            <button type="button" onClick={close} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/60" aria-label="Close navigation">
              <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
                <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <NavList onNavigate={close} />
        </aside>
      </div>
    </>
  );
}
