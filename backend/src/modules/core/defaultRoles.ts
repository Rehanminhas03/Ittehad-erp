/**
 * Starting role templates, applied by `npm run db:migrate` / `db:seed`.
 * Roles are ordinary data afterwards: an admin can rename them, edit their permissions,
 * or create new ones at runtime. Authorization code never checks role names.
 *
 * When a new permission code appears in the catalog (e.g. a new module ships), it is granted
 * to the existing roles whose template patterns match it. Permissions an admin removed
 * earlier are never re-added (only newly-created codes are considered).
 */
export interface RoleTemplate {
  name: string;
  description: string;
  patterns: readonly string[];
  /** Permission that lets its holders assign this role and manage its holders (see role.delegatedBy). */
  delegatedBy?: string;
}

/** Sales staff roles a Sales Manager may hire, reset and deactivate at their dealership. */
const SALES_TEAM = 'sales.team.manage';

export const DEFAULT_ROLES: readonly RoleTemplate[] = [
  {
    name: 'System Admin',
    description: 'Full access to everything. Assign globally.',
    patterns: ['*'],
  },
  {
    name: 'Management',
    description: 'Read-only access across modules, including cross-dealership reports when assigned globally.',
    patterns: ['*.view', '*.view_all', 'reports.*', 'core.activity.*'],
  },
  {
    name: 'Dealership Manager',
    description: 'Runs one dealership: all operational rights and approvals within it.',
    patterns: [
      'core.dealerships.view', 'core.dealerships.update', 'core.branches.*', 'core.entities.view',
      'core.users.*', 'core.roles.view', 'core.audit.view', 'core.activity.*',
      'master.*', 'sales.*', 'service.*', 'parts.*', 'accounts.*', 'reports.*',
    ],
  },
  // ---- Sales department: always assigned per dealership (see sales/permissions.ts) ----
  {
    name: 'Salesperson',
    delegatedBy: SALES_TEAM,
    description: 'Logs walk-ins and calls, follows them up and converts own leads. Sees only own leads.',
    patterns: [
      'core.dealerships.view', 'core.branches.view', 'master.models.view',
      'sales.leads.view_own', 'sales.leads.create', 'sales.leads.update_own', 'sales.leads.convert_own',
      'sales.quotations.view_own', 'sales.quotations.create', 'sales.quotations.update_own', 'sales.ppf.view_own', 'sales.ppf.create', 'sales.ppf.update_own',
      'sales.variants.view',
    ],
  },
  {
    name: 'CRO',
    delegatedBy: SALES_TEAM,
    description: 'Works social / digital leads: at least 3 follow-ups before exhausting, marks visits, converts own leads.',
    patterns: [
      'core.dealerships.view', 'core.branches.view', 'master.models.view',
      'sales.leads.view_own', 'sales.leads.create', 'sales.leads.update_own', 'sales.leads.convert_own', 'sales.leads.record_visit',
      'sales.quotations.view_own', 'sales.quotations.create', 'sales.quotations.update_own', 'sales.ppf.view_own', 'sales.ppf.create', 'sales.ppf.update_own',
      'sales.variants.view',
    ],
  },
  {
    name: 'Assistant Manager',
    delegatedBy: SALES_TEAM,
    description: "Oversees every lead of the dealership; logs leads for a salesperson or themselves and converts their own; converts other salespeople's leads only when sent to them as a duplicate customer; reopens exhausted leads.",
    patterns: [
      'core.dealerships.view', 'core.branches.view', 'master.models.view', 'sales.leads.view_all', 'sales.leads.convert_escalated',
      'sales.leads.create', 'sales.leads.update_own', 'sales.leads.convert_own', 'sales.leads.reopen',
      'sales.quotations.view_all', 'sales.quotations.create', 'sales.quotations.update', 'sales.ppf.view_all', 'sales.ppf.create', 'sales.ppf.update',
      'sales.templates.manage', 'sales.variants.view',
    ],
  },
  {
    name: 'Sales Manager',
    description: 'Department head: everything the Assistant Manager sees, the team report and track record, all orders and stock; logs and converts own leads (with quotations and PPF vouchers); reopens exhausted leads; approves orders (draft or submitted); hires, resets and deactivates sales staff.',
    patterns: [
      'core.dealerships.view', 'core.branches.view', 'master.models.view', 'core.roles.view',
      'core.users.view', 'core.users.create', 'core.users.update', 'core.users.assign_roles', 'sales.team.manage',
      'core.activity.view_team',
      'sales.leads.view_all', 'sales.leads.create', 'sales.leads.update_own', 'sales.leads.convert_own', 'sales.leads.reopen', 'sales.orders.view_all', 'sales.orders.approve', 'sales.deliveries.view_all', 'sales.stock.view',
      'sales.quotations.view_all', 'sales.quotations.create', 'sales.quotations.update_own', 'sales.ppf.view_all', 'sales.ppf.create', 'sales.ppf.update_own',
      'sales.templates.manage', 'sales.variants.view',
      'sales.reports.view',
    ],
  },
  {
    name: 'Sales Admin',
    delegatedBy: SALES_TEAM,
    description: 'Sees leads once converted and raises the sales order (PBO / CBO); enters the vehicle chassis / engine number.',
    patterns: [
      'core.dealerships.view', 'core.branches.view', 'master.models.view', 'master.customers.view',
      'sales.leads.view_converted', 'sales.leads.update_converted', 'sales.orders.view_all', 'sales.orders.create', 'sales.orders.update',
      'sales.orders.submit', 'sales.orders.cancel', 'sales.stock.view', 'sales.quotations.view_all', 'sales.ppf.view_all', 'sales.variants.view',
    ],
  },
  {
    name: 'Delivery Team',
    delegatedBy: SALES_TEAM,
    description: 'Open stock: registers incoming vehicles (straight onto a waiting order), allocates them to booked orders, moves them through logistics, hands them over once the order is approved. No access to leads.',
    patterns: [
      'core.dealerships.view', 'core.branches.view', 'master.models.view',
      'sales.stock.view', 'sales.stock.manage', 'sales.orders.view_all', 'sales.orders.allocate',
      'sales.deliveries.view_all', 'sales.deliveries.schedule', 'sales.deliveries.complete', 'sales.variants.view',
    ],
  },
  {
    name: 'Service Manager',
    description: 'Oversees workshop, approves estimates.',
    patterns: ['core.dealerships.view', 'core.branches.view', 'master.*', 'service.*', 'parts.requests.*', 'parts.catalog.view', 'parts.stock.view', 'accounts.invoices.view', 'accounts.invoices.create', 'reports.service.*'],
  },
  {
    name: 'Service Advisor',
    description: 'Opens visits, job cards, inspections and estimates.',
    patterns: [
      'core.dealerships.view', 'core.branches.view', 'master.*.view', 'master.*.create', 'master.*.update',
      'master.ownership.manage', 'service.*.view', 'service.*.create', 'service.*.update', 'service.estimates.submit', 'parts.requests.create', 'parts.requests.view',
      'parts.catalog.view', 'parts.stock.view', 'reports.service.view_own',
    ],
  },
  {
    name: 'Technician',
    description: 'Works job cards: inspections and marking work done.',
    patterns: [
      'core.dealerships.view', 'core.branches.view', 'master.vehicles.view',
      'service.job_cards.view', 'service.job_cards.work', 'service.inspections.*', 'service.setup.view',
    ],
  },
  {
    name: 'Parts Manager',
    description: 'Suppliers, purchasing, receiving and stock control.',
    patterns: ['core.dealerships.view', 'core.branches.view', 'parts.*', 'reports.parts.*'],
  },
  {
    name: 'Storekeeper',
    description: 'Parts desk: receives goods, issues parts to job cards, transfers stock.',
    patterns: [
      'core.dealerships.view', 'core.branches.view',
      'parts.catalog.view', 'parts.suppliers.view', 'parts.purchase_orders.view', 'parts.receipts.*', 'parts.stock.view',
      'parts.transfers.*', 'parts.requests.view', 'parts.issues.*', 'parts.adjustments.view', 'parts.adjustments.create',
    ],
  },
  {
    name: 'Accountant',
    description: 'Invoices, payments and the general ledger.',
    patterns: ['core.dealerships.view', 'core.branches.view', 'core.entities.view', 'master.customers.view', 'parts.suppliers.view', 'accounts.*', 'reports.accounts.*'],
  },
];
