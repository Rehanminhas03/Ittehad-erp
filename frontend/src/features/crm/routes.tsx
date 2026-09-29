import { Navigate, Route, Routes } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { entityRoutes } from '@/shared/routing';
import { customerView, vehicleModelView, vehicleView } from './config';
import SearchPage from './pages/SearchPage';
import { P } from './permissions';

/** Customers & vehicles module routes (lazy-loaded as one chunk from the app router). */
export default function CrmRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="search" replace />} />
      <Route
        path="search"
        element={
          <RequirePermission any={[P.customersView, P.vehiclesView]}>
            <SearchPage />
          </RequirePermission>
        }
      />
      {entityRoutes('customers', customerView)}
      {entityRoutes('vehicles', vehicleView)}
      {entityRoutes('vehicle-models', vehicleModelView)}
    </Routes>
  );
}
