import { Navigate, Route, Routes } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { entityRoutes } from '@/shared/routing';
import { adjustmentView, goodsReceiptView, partView, partsRequestView, purchaseOrderView, stockItemView, supplierView, transferView } from './config';
import StockMovementsPage from './pages/StockMovementsPage';
import { P } from './permissions';

/** Parts module routes (lazy-loaded as one chunk from the app router). */
export default function PartsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="stock" replace />} />
      {entityRoutes('catalog', partView)}
      {entityRoutes('suppliers', supplierView)}
      {entityRoutes('purchase-orders', purchaseOrderView)}
      {entityRoutes('goods-receipts', goodsReceiptView)}
      {entityRoutes('stock', stockItemView)}
      {entityRoutes('requests', partsRequestView)}
      {entityRoutes('transfers', transferView)}
      {entityRoutes('adjustments', adjustmentView)}
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
