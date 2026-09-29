import { lazy, type ReactNode, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { RequireAuth } from '@/features/auth';
import { isModuleEnabled, type ModuleKey } from '@/shared/config';
import { PageSpinner } from '@/shared/components/ui';
import { AppShell } from './AppShell';
import { RouteError } from './RouteError';

// Route-level code splitting: each module is its own chunk.
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/features/reports/pages/DashboardPage'));
const AdminRoutes = lazy(() => import('@/features/admin/routes'));
const CrmRoutes = lazy(() => import('@/features/crm/routes'));
const SalesRoutes = lazy(() => import('@/features/sales/routes'));
const ServiceRoutes = lazy(() => import('@/features/service/routes'));
const PartsRoutes = lazy(() => import('@/features/parts/routes'));
const AccountsRoutes = lazy(() => import('@/features/accounts/routes'));
const AccountPage = lazy(() => import('@/features/auth/pages/AccountPage'));
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));

/** Routes of modules switched off in shared/config/modules.ts are not mounted (they fall to Not found). */
function moduleRoutes(defs: [ModuleKey, string, ReactNode][]) {
  return defs.filter(([m]) => isModuleEnabled(m)).map(([, path, element]) => ({ path, element }));
}

export const router = createBrowserRouter([
  {
    path: '/login',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<PageSpinner />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    errorElement: <RouteError />,
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        // A page that fails to render shows RouteError inside the layout, so the menu stays usable.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'activity', element: <ActivityPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          ...moduleRoutes([
            ['sales', 'sales/*', <SalesRoutes />],
            ['service', 'service/*', <ServiceRoutes />],
            ['parts', 'parts/*', <PartsRoutes />],
            ['accounts', 'accounts/*', <AccountsRoutes />],
            ['crm', 'crm/*', <CrmRoutes />],
            ['admin', 'admin/*', <AdminRoutes />],
          ]),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

function NotFound() {
  return <p className="py-20 text-center text-sm text-slate-500">Page not found.</p>;
}
