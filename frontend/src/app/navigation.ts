/**
 * Sidebar navigation. Each item is shown only if the user holds any of its permissions
 * (UI convenience; every route and endpoint is still authorized server-side).
 * Modules add their sections here as they ship; sections of modules switched off in
 * shared/config/modules.ts are hidden.
 */
import { isModuleEnabled, type ModuleKey } from '@/shared/config';

export interface NavItem {
  label: string;
  to: string;
  any: readonly string[];
}

export interface NavSection {
  title: string;
  module?: ModuleKey;
  items: NavItem[];
}

const ALL_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', any: [] },
      // Everyone sees their own activity; managers also get their team's (a tab on the page).
      { label: 'Activity', to: '/activity', any: [] },
      // Everyone: what happens at their dealership, live (the bell in the top bar opens the latest).
      { label: 'Notifications', to: '/notifications', any: [] },
    ],
  },
  {
    title: 'Sales',
    module: 'sales',
    items: [
      { label: 'Leads', to: '/sales/leads', any: ['sales.leads.view_all', 'sales.leads.view_own', 'sales.leads.view_converted'] },
      { label: 'Duplicate customers', to: '/sales/leads?escalated=true&range=all', any: ['sales.leads.convert_escalated'] },
      { label: 'Sales orders', to: '/sales/orders', any: ['sales.orders.view_all', 'sales.orders.view_own'] },
      { label: 'Open stock', to: '/sales/stock', any: ['sales.stock.view'] },
      // Every booked order by stage (a salesperson: their own customers' cars).
      { label: 'Deliveries', to: '/sales/delivery-status', any: ['sales.orders.view_all', 'sales.deliveries.view_all', 'sales.deliveries.view_own', 'sales.leads.convert_own'] },
      { label: 'Delivery report', to: '/sales/delivery-report', any: ['sales.deliveries.view_all'] },
      { label: 'Quotations', to: '/sales/quotations', any: ['sales.quotations.view_all', 'sales.quotations.view_own'] },
      { label: 'PPF vouchers', to: '/sales/ppf-forms', any: ['sales.ppf.view_all', 'sales.ppf.view_own'] },
      { label: 'Document formats', to: '/sales/document-formats', any: ['sales.templates.manage'] },
      { label: 'Variant codes', to: '/sales/variants', any: ['sales.templates.manage'] },
      { label: 'Track record', to: '/sales/track-record', any: ['sales.ppf.view_all', 'sales.ppf.view_own', 'sales.reports.view'] },
      { label: 'Team report', to: '/sales/team', any: ['sales.reports.view'] },
    ],
  },
  {
    title: 'Service',
    module: 'service',
    items: [
      { label: 'Service visits', to: '/service/visits', any: ['service.visits.view', 'service.visits.view_own'] },
      { label: 'Job cards', to: '/service/job-cards', any: ['service.job_cards.view'] },
      { label: 'Estimates', to: '/service/estimates', any: ['service.estimates.view', 'service.estimates.view_own'] },
      { label: 'Service schedules', to: '/service/setup/schedules', any: ['service.setup.view'] },
      { label: 'Inspection checklist', to: '/service/setup/checklist', any: ['service.setup.view'] },
    ],
  },
  {
    title: 'Parts',
    module: 'parts',
    items: [
      { label: 'Stock', to: '/parts/stock', any: ['parts.stock.view'] },
      { label: 'Parts requests', to: '/parts/requests', any: ['parts.requests.view'] },
      { label: 'Purchase orders', to: '/parts/purchase-orders', any: ['parts.purchase_orders.view'] },
      { label: 'Goods receipts', to: '/parts/goods-receipts', any: ['parts.receipts.view'] },
      { label: 'Transfers', to: '/parts/transfers', any: ['parts.transfers.view'] },
      { label: 'Adjustments', to: '/parts/adjustments', any: ['parts.adjustments.view'] },
      { label: 'Stock movements', to: '/parts/movements', any: ['parts.stock.view'] },
      { label: 'Suppliers', to: '/parts/suppliers', any: ['parts.suppliers.view'] },
      { label: 'Parts catalogue', to: '/parts/catalog', any: ['parts.catalog.view'] },
    ],
  },
  {
    title: 'Accounts',
    module: 'accounts',
    items: [
      { label: 'Invoices', to: '/accounts/invoices', any: ['accounts.invoices.view'] },
      { label: 'Payments', to: '/accounts/payments', any: ['accounts.payments.view'] },
      { label: 'Receivables', to: '/accounts/reports/receivables', any: ['accounts.reports.view'] },
      { label: 'Payables', to: '/accounts/reports/payables', any: ['accounts.reports.view'] },
      { label: 'Trial balance', to: '/accounts/reports/trial-balance', any: ['accounts.reports.view'] },
      { label: 'Journal', to: '/accounts/journals', any: ['accounts.journals.view'] },
      { label: 'Chart of accounts', to: '/accounts/chart', any: ['accounts.chart.view'] },
    ],
  },
  {
    title: 'Customers & vehicles',
    module: 'crm',
    items: [
      { label: 'Search', to: '/crm/search', any: ['master.customers.view', 'master.vehicles.view'] },
      { label: 'Customers', to: '/crm/customers', any: ['master.customers.view'] },
      { label: 'Vehicles', to: '/crm/vehicles', any: ['master.vehicles.view'] },
      { label: 'Vehicle models', to: '/crm/vehicle-models', any: ['master.models.manage'] },
    ],
  },
  {
    title: 'Administration',
    module: 'admin',
    items: [
      { label: 'Dealerships', to: '/admin/dealerships', any: ['core.dealerships.update'] },
      { label: 'Branches', to: '/admin/branches', any: ['core.branches.update'] },
      { label: 'Users & staff', to: '/admin/users', any: ['core.users.view'] },
      { label: 'Roles & permissions', to: '/admin/roles', any: ['core.roles.manage', 'core.audit.view'] },
      { label: 'Legal entities', to: '/admin/legal-entities', any: ['core.entities.view'] },
      { label: 'Accounting entities', to: '/admin/accounting-entities', any: ['core.entities.view'] },
      { label: 'Audit log', to: '/admin/audit', any: ['core.audit.view'] },
    ],
  },
];

export const NAVIGATION: NavSection[] = ALL_SECTIONS.filter((s) => !s.module || isModuleEnabled(s.module));
