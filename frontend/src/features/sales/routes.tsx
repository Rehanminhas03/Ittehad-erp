import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { PageSpinner } from '@/shared/components/ui';
import { entityRoutes } from '@/shared/routing';
import { deliveryView } from './deliveries/deliveryView';
import { ppfView, quotationView, variantView } from './documents';
import { leadView } from './leads/leadView';
import { orderView } from './orders/orderView';
import { P } from './permissions';
import { stockView } from './stock/stockView';

const TeamReportPage = lazy(() => import('./team/TeamReportPage'));
const TrackRecordPage = lazy(() => import('./team/TrackRecordPage'));
const DocumentFormatsPage = lazy(() => import('./documents/DocumentFormatsPage'));

/** Sales module routes (lazy-loaded as one chunk from the app router). */
export default function SalesRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="leads" replace />} />
      {entityRoutes('leads', leadView)}
      {entityRoutes('orders', orderView)}
      {entityRoutes('deliveries', deliveryView)}
      {entityRoutes('stock', stockView)}
      {entityRoutes('quotations', quotationView)}
      {entityRoutes('ppf-forms', ppfView)}
      {entityRoutes('variants', variantView)}
      <Route
        path="document-formats"
        element={
          <RequirePermission any={[P.templatesManage]}>
            <Suspense fallback={<PageSpinner />}>
              <DocumentFormatsPage />
            </Suspense>
          </RequirePermission>
        }
      />
      <Route
        path="track-record"
        element={
          <RequirePermission any={[P.ppfViewAll, P.ppfViewOwn, P.reportsView]}>
            <Suspense fallback={<PageSpinner />}>
              <TrackRecordPage />
            </Suspense>
          </RequirePermission>
        }
      />
      <Route
        path="team"
        element={
          <RequirePermission any={[P.reportsView]}>
            <Suspense fallback={<PageSpinner />}>
              <TeamReportPage />
            </Suspense>
          </RequirePermission>
        }
      />
    </Routes>
  );
}
