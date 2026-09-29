import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { LiveNotifications } from '@/features/notifications';
import { GlassBackdrop, PageSpinner, Toasts } from '@/shared/components/ui';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Signed-in layout over the glass backdrop: a floating glass sidebar (a slide-in drawer on phones
 * and tablets), a glass top bar, and the routed page.
 */
export function AppShell() {
  return (
    <div className="relative isolate flex min-h-screen">
      <GlassBackdrop fixed />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-10 sm:px-6 lg:px-8">
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <Toasts />
      {/* Live notifications: new ones pop up here as they happen (socket). */}
      <LiveNotifications />
    </div>
  );
}
