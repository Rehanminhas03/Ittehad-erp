import { ApiRouter } from '../../http/apiRouter';
import { forbidden } from '../../lib/errors';
import { ALL_REPORT_PERMISSIONS, availableDashboards, DASHBOARDS } from './dashboards';
import { DashboardListSchema, DashboardParams, DashboardQuery, DashboardSchema } from './schemas';

const dashboards = new ApiRouter('/reports/dashboards', 'Dashboard')
  .route({
    method: 'get',
    path: '/',
    operationId: 'listDashboards',
    summary: 'Dashboards available to the caller, and whether each covers the group, their dealerships or only their own work',
    permission: ALL_REPORT_PERMISSIONS,
    response: DashboardListSchema,
    handler: async (ctx) => availableDashboards(ctx.access),
  })
  .route({
    method: 'get',
    path: '/:key',
    operationId: 'getDashboard',
    summary: "A dashboard's figures for a period, aggregated server-side within the caller's scope",
    permission: ALL_REPORT_PERMISSIONS,
    params: DashboardParams,
    query: DashboardQuery,
    response: DashboardSchema,
    handler: (ctx) => {
      const def = DASHBOARDS.find((d) => d.key === ctx.params.key)!;
      if (!ctx.access.hasAny([def.view, def.viewOwn].filter((c): c is string => !!c))) throw forbidden();
      return def.build(ctx, ctx.query);
    },
  });

export const reportsRouters = [dashboards];
