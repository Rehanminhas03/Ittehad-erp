import { DevUserSwitcher } from '@/features/auth';
import { GlobalSearchBox } from '@/features/crm';
import { NotificationBell } from '@/features/notifications';
import { ActionBell } from '@/features/sales';
import { setMobileNavOpen, toggleSidebar } from '@/features/ui/uiSlice';
import { isModuleEnabled } from '@/shared/config';
import { useAppDispatch, useAuth } from '@/shared/hooks';
import { UserMenu } from './UserMenu';

/** Glass top bar: navigation toggle, (global search), dealership scope, account menu. */
export function Topbar() {
  const { me } = useAuth();
  const dispatch = useAppDispatch();
  const scopeLabel = me && me.dealerships.length === 1 ? me.dealerships[0]!.name : me ? `${me.dealerships.length} dealerships` : '';

  const toggle = () => {
    // Desktop collapses the floating sidebar; smaller screens open the drawer.
    if (window.matchMedia('(min-width: 1024px)').matches) dispatch(toggleSidebar());
    else dispatch(setMobileNavOpen(true));
  };

  return (
    <div className="sticky top-0 z-30 px-3 pt-3 sm:px-6 lg:px-8">
      <header className="glass mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 rounded-2xl px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-white/60 hover:text-slate-900"
            aria-label="Toggle navigation"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          {/* Customer / vehicle search belongs to the CRM module (hidden while only Sales is shown). */}
          {isModuleEnabled('crm') && me?.permissions.some((p) => p.code.startsWith('master.')) && <GlobalSearchBox />}
        </div>
        <div className="flex items-center gap-2 text-sm sm:gap-3">
          <DevUserSwitcher />
          {/* What is waiting for you (approvals, cars to hand over…), on every page. */}
          <ActionBell />
          {/* Notifications: unread count (live) and the latest four. */}
          <NotificationBell />
          {scopeLabel && (
            <span className="hidden items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-white md:flex">
              <svg viewBox="0 0 16 16" className="size-3.5 text-slate-500" fill="none" aria-hidden>
                <path d="M2 14V6l6-3 6 3v8M2 14h12M2 14v-2h12v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {scopeLabel}
            </span>
          )}
          <UserMenu />
        </div>
      </header>
    </div>
  );
}
