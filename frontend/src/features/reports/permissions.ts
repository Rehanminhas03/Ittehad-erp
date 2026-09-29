/** Permission codes of the dashboards (defined server-side in reports/permissions.ts). */
export const P = {
  salesView: 'reports.sales.view',
  salesViewOwn: 'reports.sales.view_own',
  serviceView: 'reports.service.view',
  serviceViewOwn: 'reports.service.view_own',
  partsView: 'reports.parts.view',
  accountsView: 'reports.accounts.view',
} as const;

export type DashboardKey = 'sales' | 'service' | 'parts' | 'accounts';

/** Which permissions open each dashboard (the server decides the actual reach). */
export const DASHBOARD_PERMISSIONS: Record<DashboardKey, string[]> = {
  sales: [P.salesView, P.salesViewOwn],
  service: [P.serviceView, P.serviceViewOwn],
  parts: [P.partsView],
  accounts: [P.accountsView],
};

export const ANY_REPORT = Object.values(DASHBOARD_PERMISSIONS).flat();

export const MODE_LABELS: Record<string, string> = {
  group: 'All dealerships',
  dealership: 'Your dealerships',
  own: 'Your own work',
};
