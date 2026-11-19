import { Navigate, Route, Routes, useSearchParams } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { EntityListView } from '@/shared/components';
import { entityRoutes } from '@/shared/routing';
import { adjustmentView, goodsReceiptView, partView, partsRequestView, purchaseOrderView, supplierView, transferView } from './config';
import InventoryPage from './pages/InventoryPage';
import JobCardRequestsPage, { JobCardRequestsDetail } from './pages/JobCardRequestsPage';
import IssuePartsPage from './pages/IssuePartsPage';
import NewPurchaseOrderPage from './pages/NewPurchaseOrderPage';
import ManagePartsPage from './pages/ManagePartsPage';
import PriceListPage from './pages/PriceListPage';
import PartsReportPage from './pages/PartsReportPage';
import ReportsPage from './pages/ReportsPage';
import ReceiveStockPage from './pages/ReceiveStockPage';
import StockMovementsPage from './pages/StockMovementsPage';
import { P } from './permissions';

/** The requests list: one row per job card; the returns from the workshop keep their own list. */
function RequestsList() {
  const [params] = useSearchParams();
  return params.get('kind') === 'return' ? <EntityListView key="returns" config={partsRequestView} /> : <JobCardRequestsPage />;
}

/** Parts module routes (lazy-loaded as one chunk from the app router). */
export default function PartsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="inventory" replace />} />
      {entityRoutes('catalog', partView)}
      {entityRoutes('suppliers', supplierView)}
      {entityRoutes('purchase-orders', purchaseOrderView, { create: <NewPurchaseOrderPage /> })}
      {entityRoutes('goods-receipts', goodsReceiptView)}
      {/* The old Stock list is replaced by Store stock (bin and reorder level are set there). */}
      <Route path="stock/*" element={<Navigate to="/parts/inventory" replace />} />
      <Route
        path="requests/job-card/:jobCardId"
        element={
          <RequirePermission any={[P.requestsView]}>
            <JobCardRequestsDetail />
          </RequirePermission>
        }
      />
      {entityRoutes('requests', partsRequestView, { list: <RequestsList /> })}
      {entityRoutes('transfers', transferView)}
      {entityRoutes('adjustments', adjustmentView)}
      <Route
        path="prices"
        element={
          <RequirePermission any={[P.catalogView]}>
            <PriceListPage />
          </RequirePermission>
        }
      />
      <Route
        path="inventory"
        element={
          <RequirePermission any={[P.stockView]}>
            <InventoryPage />
          </RequirePermission>
        }
      />
      <Route
        path="manage"
        element={
          <RequirePermission any={[P.catalogManage]}>
            <ManagePartsPage />
          </RequirePermission>
        }
      />
      <Route
        path="receive"
        element={
          <RequirePermission any={[P.receiptsCreate]}>
            <ReceiveStockPage />
          </RequirePermission>
        }
      />
      <Route
        path="issue"
        element={
          <RequirePermission any={[P.issuesCreate]}>
            <IssuePartsPage />
          </RequirePermission>
        }
      />
      <Route
        path="reports"
        element={
          <RequirePermission any={[P.receiptsView]}>
            <ReportsPage />
          </RequirePermission>
        }
      />
      <Route
        path="report"
        element={
          <RequirePermission any={[P.receiptsView]}>
            <PartsReportPage />
          </RequirePermission>
        }
      />
      <Route
        path="movements"
        element={
          <RequirePermission any={[P.receiptsView]}>
            <StockMovementsPage />
          </RequirePermission>
        }
      />
    </Routes>
  );
}
