import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router';
import { CsvPreviewHost } from '@/features/sales/exports/CsvPreviewHost';
import { LiveNotifications } from '@/features/notifications';
import { setReportDealership } from '@/features/sales/exports/exporters';
import { useAuth } from '@/shared/hooks';
import { GlassBackdrop, PageSpinner, Toasts } from '@/shared/components/ui';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Signed-in layout over the glass backdrop: a floating glass sidebar (a slide-in drawer on phones
 * and tablets), a glass top bar, and the routed page.
 */
export function AppShell() {
  const { me } = useAuth();
  // The report PDFs carry the letterhead of the user's dealership (when they work in one brand).
  useEffect(() => {
    const brands = new Set((me?.dealerships ?? []).map((d) => d.code.slice(0, 3)));
    setReportDealership(brands.size === 1 ? me!.dealerships[0]!.code : null);
  }, [me]);
  return (
    <div className="relative isolate flex min-h-screen">
      <GlassBackdrop fixed />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-10 sm:px-6 lg:px-8">
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
            <CsvPreviewHost />
          </Suspense>
        </main>
      </div>
      <Toasts />
      {/* Live notifications: new ones pop up here as they happen (socket). */}
      <LiveNotifications />
    </div>
  );
}
