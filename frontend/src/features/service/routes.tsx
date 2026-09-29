import { Navigate, Route, Routes } from 'react-router';
import { entityRoutes } from '@/shared/routing';
import { estimateView, inspectionTemplateView, jobCardView, scheduleItemView, visitView } from './config';

/** Service module routes (lazy-loaded as one chunk from the app router). */
export default function ServiceRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="visits" replace />} />
      {entityRoutes('visits', visitView)}
      {entityRoutes('job-cards', jobCardView)}
      {entityRoutes('estimates', estimateView)}
      {entityRoutes('setup/schedules', scheduleItemView)}
      {entityRoutes('setup/checklist', inspectionTemplateView)}
    </Routes>
  );
}
