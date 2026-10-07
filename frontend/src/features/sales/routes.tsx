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
const StandaloneDocumentPage = lazy(() => import('./documents/StandaloneDocumentPage'));
const DeliveryReportPage = lazy(() => import('./deliveries/DeliveryReportPage'));
const DeliveryStatusPage = lazy(() => import('./deliveries/DeliveryStatusPage'));
const LeaveListPage = lazy(() => import('./leave/LeaveListPage'));
const LeaveDetailPage = lazy(() => import('./leave/LeaveDetailPage'));

/** Sales module routes (lazy-loaded as one chunk from the app router). */
export default function SalesRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="leads" replace />} />
      {entityRoutes('leads', leadView)}
      {entityRoutes('orders', orderView)}
      {entityRoutes('deliveries', deliveryView)}
      {entityRoutes('stock', stockView)}
      {entityRoutes('quotations', quotationView, { create: <Suspense fallback={<PageSpinner />}><StandaloneDocumentPage kind="quotation" /></Suspense> })}
      {entityRoutes('ppf-forms', ppfView, { create: <Suspense fallback={<PageSpinner />}><StandaloneDocumentPage kind="ppf" /></Suspense> })}
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
        path="delivery-status"
        element={
          <RequirePermission any={[P.ordersViewAll, P.deliveriesViewAll, P.ordersViewOwn, P.deliveriesViewOwn, P.leadsViewOwn]}>
            <Suspense fallback={<PageSpinner />}>
              <DeliveryStatusPage />
            </Suspense>
          </RequirePermission>
        }
      />
      <Route
        path="delivery-report"
        element={
          <RequirePermission any={[P.deliveriesViewAll]}>
            <Suspense fallback={<PageSpinner />}>
              <DeliveryReportPage />
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
        path="leave"
        element={
          <RequirePermission any={[P.leaveApply, P.leaveApprove]}>
            <Suspense fallback={<PageSpinner />}>
              <LeaveListPage />
            </Suspense>
          </RequirePermission>
        }
      />
      <Route
        path="leave/:id"
        element={
          <RequirePermission any={[P.leaveApply, P.leaveApprove]}>
            <Suspense fallback={<PageSpinner />}>
              <LeaveDetailPage />
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
