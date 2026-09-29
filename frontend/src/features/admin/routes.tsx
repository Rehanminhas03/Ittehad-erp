import { Navigate, Route, Routes } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { entityRoutes } from '@/shared/routing';
import { accountingEntityView, branchView, dealershipView, legalEntityView, roleView, userView } from './config';
import AuditLogPage from './pages/AuditLogPage';
import { P } from './permissions';

/** Admin module routes (lazy-loaded as one chunk from the app router). */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="dealerships" replace />} />
      {entityRoutes('dealerships', dealershipView)}
      {entityRoutes('branches', branchView)}
      {entityRoutes('users', userView)}
      {entityRoutes('roles', roleView)}
      {entityRoutes('legal-entities', legalEntityView)}
      {entityRoutes('accounting-entities', accountingEntityView)}
      <Route
        path="audit"
        element={
          <RequirePermission any={[P.auditView]}>
            <AuditLogPage />
          </RequirePermission>
        }
      />
    </Routes>
  );
}
