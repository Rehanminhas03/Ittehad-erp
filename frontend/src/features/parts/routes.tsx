import { Navigate, Route, Routes } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { entityRoutes } from '@/shared/routing';
import { adjustmentView, goodsReceiptView, partView, partsRequestView, purchaseOrderView, supplierView, transferView } from './config';
import InventoryPage from './pages/InventoryPage';
import IssuePartsPage from './pages/IssuePartsPage';
import ManagePartsPage from './pages/ManagePartsPage';
import PriceListPage from './pages/PriceListPage';
import PartsReportPage from './pages/PartsReportPage';
import ReceiveStockPage from './pages/ReceiveStockPage';
import StockMovementsPage from './pages/StockMovementsPage';
import { P } from './permissions';

/** Parts module routes (lazy-loaded as one chunk from the app router). */
export default function PartsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="inventory" replace />} />
      {entityRoutes('catalog', partView)}
      {entityRoutes('suppliers', supplierView)}
      {entityRoutes('purchase-orders', purchaseOrderView)}
      {entityRoutes('goods-receipts', goodsReceiptView)}
      {/* The old Stock list is replaced by Store stock (bin and reorder level are set there). */}
      <Route path="stock/*" element={<Navigate to="/parts/inventory" replace />} />
      {entityRoutes('requests', partsRequestView)}
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
        path="report"
        element={
          <RequirePermission any={[P.stockView]}>
            <PartsReportPage />
          </RequirePermission>
        }
      />
      <Route
        path="movements"
        element={
          <RequirePermission any={[P.stockView]}>
            <StockMovementsPage />
          </RequirePermission>
        }
      />
    </Routes>
  );
}
