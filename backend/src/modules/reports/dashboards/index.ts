import type { Access } from '../../../auth/access';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { ReportsPerm as P } from '../permissions';
import type { Dashboard, DashboardKey, DashboardQuery } from '../schemas';
import { accountsDashboard } from './accounts';
import { partsDashboard } from './parts';
import { salesDashboard } from './sales';
import { serviceDashboard } from './service';

interface DashboardDef {
  key: DashboardKey;
  title: string;
  view: string;
  viewOwn?: string;
  build: (ctx: EntityCtx, q: z.output<typeof DashboardQuery>) => Promise<Dashboard>;
}

/** Registry: a new dashboard is one entry here plus its builder. */
export const DASHBOARDS: readonly DashboardDef[] = [
  { key: 'sales', title: 'Sales', view: P.salesView, viewOwn: P.salesViewOwn, build: salesDashboard },
  { key: 'service', title: 'Service', view: P.serviceView, viewOwn: P.serviceViewOwn, build: serviceDashboard },
  { key: 'parts', title: 'Parts & inventory', view: P.partsView, build: partsDashboard },
  { key: 'accounts', title: 'Finance', view: P.accountsView, build: accountsDashboard },
];

export const ALL_REPORT_PERMISSIONS = [...new Set(DASHBOARDS.flatMap((d) => [d.view, d.viewOwn].filter((c): c is string => !!c)))];

/** The dashboards the caller may open, with the reach of each. */
export function availableDashboards(access: Access) {
  return DASHBOARDS.filter((d) => access.has(d.view) || (d.viewOwn && access.has(d.viewOwn))).map((d) => ({
    key: d.key,
    title: d.title,
    mode: access.hasGlobal(d.view) ? ('group' as const) : access.has(d.view) ? ('dealership' as const) : ('own' as const),
  }));
}
