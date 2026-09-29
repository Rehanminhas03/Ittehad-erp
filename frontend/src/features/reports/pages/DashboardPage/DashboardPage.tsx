import { SalesDashboard, SalesPermissions as SP } from '@/features/sales';
import { PageHeader } from '@/shared/components/ui';
import { isModuleEnabled } from '@/shared/config';
import { useAuth, usePermission } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { RoleDashboards } from '../../components/RoleDashboards';
import { WIDGETS } from '../../config/widgets';
import { ANY_REPORT } from '../../permissions';

/** Anyone who works in Sales (any lead, order, stock or delivery view). */
const SALES_VIEWS = [
  SP.leadsViewAll,
  SP.leadsViewOwn,
  SP.leadsViewConverted,
  SP.ordersViewAll,
  SP.ordersViewOwn,
  SP.stockView,
  SP.deliveriesViewAll,
  SP.deliveriesViewOwn,
];

/**
 * Home page. Sales staff get their glass sales dashboard (KPIs, charts, latest records, all in
 * their own scope); everyone else gets the live work queues and the performance dashboards.
 */
export default function DashboardPage() {
  const perm = usePermission();
  if (isModuleEnabled('sales') && perm.can(SALES_VIEWS)) return <SalesDashboard />;
  return <GeneralDashboard />;
}

function GeneralDashboard() {
  const { user } = useAuth();
  const perm = usePermission();
  const widgets = WIDGETS.filter((w) => (!w.module || isModuleEnabled(w.module)) && perm.can(w.any));
  const hasReports = perm.can(ANY_REPORT);

  return (
    <div>
      <PageHeader title={`Welcome back, ${user?.fullName.split(' ')[0] ?? ''}`} subtitle="Figures reflect only the dealerships, branches and work you can access." />
      {widgets.length === 0 && !hasReports && <p className="py-10 text-sm text-slate-500">No dashboard is available for your roles yet.</p>}
      {widgets.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Right now</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {widgets.map((w) => (
              <div key={w.id} className={cn(w.span === 2 && 'md:col-span-2', w.span === 3 && 'md:col-span-3')}>
                {w.render()}
              </div>
            ))}
          </div>
        </section>
      )}
      {hasReports && <RoleDashboards />}
    </div>
  );
}
