import { definePermissions } from '../../auth/permissions';

/**
 * Dashboard permissions. `view` shows everything in the grant's scope (group, dealership or
 * branch); `view_own` shows only the caller's own work (a salesperson's orders, an advisor's visits).
 */
export const ReportsPerm = definePermissions('reports', {
  salesView: ['reports.sales.view', 'Sales dashboard for the dealerships/branches in scope'],
  salesViewOwn: ['reports.sales.view_own', 'Sales dashboard of your own leads, orders and deliveries'],
  serviceView: ['reports.service.view', 'Service dashboard for the dealerships/branches in scope'],
  serviceViewOwn: ['reports.service.view_own', 'Service dashboard of the visits you handle as advisor'],
  partsView: ['reports.parts.view', 'Parts & inventory dashboard'],
  accountsView: ['reports.accounts.view', 'Finance dashboard: invoicing, collections, receivables, payables'],
});
