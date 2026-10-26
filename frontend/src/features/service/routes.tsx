import { Navigate, Route, Routes } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { entityRoutes } from '@/shared/routing';
import ServicesDuePage from './pages/ServicesDuePage';
import { P } from './permissions';
import { estimateView, inspectionTemplateView, jobCardView, scheduleItemView, visitView } from './config';

/** Service module routes (lazy-loaded as one chunk from the app router). */
export default function ServiceRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="visits" replace />} />
      <Route
        path="reminders"
        element={
          <RequirePermission any={[P.remindersView]}>
            <ServicesDuePage />
          </RequirePermission>
        }
      />
      {entityRoutes('visits', visitView)}
      {entityRoutes('job-cards', jobCardView)}
      {entityRoutes('estimates', estimateView)}
      {entityRoutes('setup/schedules', scheduleItemView)}
      {entityRoutes('setup/checklist', inspectionTemplateView)}
    </Routes>
  );
}
