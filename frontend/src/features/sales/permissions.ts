/**
 * Permission codes and fixed lists used by the sales screens (defined server-side in
 * backend/src/modules/sales). Access matrix, every role scoped to one dealership:
 *
 *   Salesperson / CRO    own leads, convert own
 *   Assistant Manager    all leads; logs and converts own; converts duplicates sent to them; reopens exhausted
 *   Sales Manager        all leads + orders; logs and converts own; approves orders (draft or submitted);
 *                        reopens exhausted; team report and track record
 *   Sales Admin          leads once converted, raises the sales order
 *   Delivery Team        open stock, allocation from booking, logistics, hand-over once approved (no leads)
 *
 * Quotations and PPF forms: the salesperson and the Sales Manager (own leads) and the Assistant Manager
 * (any lead) issue and correct them; the Sales Admin views, downloads and prints them.
 */
export const P = {
  leadsViewAll: 'sales.leads.view_all',
  leadsViewOwn: 'sales.leads.view_own',
  leadsViewConverted: 'sales.leads.view_converted',
  leadsCreate: 'sales.leads.create',
  leadsUpdate: 'sales.leads.update',
  leadsUpdateOwn: 'sales.leads.update_own',
  leadsUpdateConverted: 'sales.leads.update_converted',
  leadsRecordVisit: 'sales.leads.record_visit',
  leadsConvertOwn: 'sales.leads.convert_own',
  leadsConvertEscalated: 'sales.leads.convert_escalated',
  reportsView: 'sales.reports.view',
  teamManage: 'sales.team.manage',
  stockView: 'sales.stock.view',
  stockManage: 'sales.stock.manage',
  ordersViewAll: 'sales.orders.view_all',
  ordersViewOwn: 'sales.orders.view_own',
  ordersCreate: 'sales.orders.create',
  ordersUpdate: 'sales.orders.update',
  ordersUpdateOwn: 'sales.orders.update_own',
  ordersApprove: 'sales.orders.approve',
  ordersAllocate: 'sales.orders.allocate',
  deliveriesViewAll: 'sales.deliveries.view_all',
  deliveriesViewOwn: 'sales.deliveries.view_own',
  deliveriesSchedule: 'sales.deliveries.schedule',
  deliveriesComplete: 'sales.deliveries.complete',
  quotationsViewAll: 'sales.quotations.view_all',
  quotationsViewOwn: 'sales.quotations.view_own',
  quotationsCreate: 'sales.quotations.create',
  quotationsUpdate: 'sales.quotations.update',
  quotationsUpdateOwn: 'sales.quotations.update_own',
  templatesManage: 'sales.templates.manage',
  variantsView: 'sales.variants.view',
  ppfViewAll: 'sales.ppf.view_all',
  ppfViewOwn: 'sales.ppf.view_own',
  ppfCreate: 'sales.ppf.create',
  ppfUpdate: 'sales.ppf.update',
  ppfUpdateOwn: 'sales.ppf.update_own',
} as const;

export const LEAD_STATES = ['new', 'follow_up', 'visited', 'converted', 'processing', 'completed', 'exhausted'] as const;
/** Open leads: still with the salesperson (follow-ups, conversion). */
export const OPEN_LEAD_STATES = ['new', 'follow_up', 'visited'] as const;
export const ORDER_STATES = ['draft', 'submitted', 'approved', 'delivered', 'cancelled'] as const;
export const DELIVERY_STATES = ['scheduled', 'delivered', 'cancelled'] as const;
/** Follow-ups needed before a lead may be marked exhausted (enforced by the server). */
export const MIN_FOLLOW_UPS_TO_EXHAUST = 3;

export const FOLLOW_UP_OUTCOMES = [
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'visited', label: 'Visited (in person)' },
];

export const PAYMENT_INSTRUMENTS = [
  { value: 'pay_order', label: 'Pay order' },
  { value: 'bank_draft', label: 'Bank draft' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online_transfer', label: 'Online transfer' },
  { value: 'cash', label: 'Cash' },
];

export const ORDER_TYPES = [
  { value: 'pbo', label: 'PBO — provisional booking order' },
  { value: 'cbo', label: 'CBO — confirmed booking order' },
];

/** Fixed delivery document checklist (matches the backend's DELIVERY_DOCUMENTS). */
export const DELIVERY_DOCUMENTS = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'registration_book', label: 'Registration book' },
  { value: 'warranty_card', label: 'Warranty card' },
  { value: 'owners_manual', label: "Owner's manual" },
  { value: 'insurance_cover_note', label: 'Insurance cover note' },
];

export const LEAD_SOURCES = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'social', label: 'Social media' },
  { value: 'referral', label: 'Referral' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

/**
 * "Visited" belongs to the CRO's social / digital leads (walk-ins are already in the showroom): shown
 * to the CRO (who records it) and to team views (who see the CRO's leads), not to salespeople.
 */
export const showsVisited = (perm: { can: (codes: readonly string[]) => boolean }) => perm.can([P.leadsRecordVisit, P.leadsViewAll]);

/** What the lead's latest activity was, from its status (the date is its last update). */
export const LAST_ACTIVITY: Record<string, string> = {
  new: 'Logged',
  follow_up: 'Followed up',
  visited: 'Visited',
  converted: 'Converted',
  processing: 'Order raised',
  completed: 'Delivered',
  exhausted: 'Exhausted',
};

export const labelOf = (list: { value: string; label: string }[], v: string | null | undefined) =>
  v ? (list.find((x) => x.value === v)?.label ?? v) : null;
