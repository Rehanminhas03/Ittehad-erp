import { definePermissions } from '../../auth/permissions';

/**
 * Sales access matrix (every grant is dealership-scoped for the five sales roles):
 *
 *   Role               Own leads   All leads               Convert to Lead                 Create order
 *   Salesperson        yes         no                      own                             no
 *   Assistant Manager  yes         yes (own dealership)    own + duplicates sent to them   no
 *   Sales Manager      yes         yes (department)        own                             no
 *   CRO                own         no                      own                             no
 *   Sales Admin        -           post-conversion only    no                              yes
 * The Assistant Manager and Sales Manager also reopen exhausted leads; the Manager approves orders
 * (from draft or submitted).
 *
 * Delivery Team (one login can hold it at several dealerships): Open Stock (register incoming
 * vehicles, straight onto a waiting order), allocate stock to booked orders (from draft), move
 * vehicles through logistics, hand over once the order is approved. No access to leads.
 */
export const SalesPerm = definePermissions('sales', {
  leadsViewAll: ['sales.leads.view_all', 'View every lead in scope'],
  leadsViewOwn: ['sales.leads.view_own', 'View own leads'],
  leadsViewConverted: ['sales.leads.view_converted', 'View leads once they are converted (to raise the sales order)'],
  leadsCreate: ['sales.leads.create', 'Log leads (walk-ins, calls, social / digital)'],
  leadsUpdate: ['sales.leads.update', 'Edit any lead in scope (incl. reassigning)'],
  leadsUpdateOwn: ['sales.leads.update_own', 'Edit own leads and record their follow-ups'],
  leadsRecordVisit: ['sales.leads.record_visit', 'Record in-person visits on social / digital leads (CRO); walk-ins are already in the showroom'],
  leadsUpdateConverted: ['sales.leads.update_converted', 'Correct customer details (name, phone, email, colour) on converted leads'],
  leadsConvertOwn: ['sales.leads.convert_own', 'Convert own leads (capture the qualifying details)'],
  leadsReopen: ['sales.leads.reopen', 'Reopen an exhausted lead (back to follow-up)'],
  leadsReassign: ['sales.leads.reassign', 'Give a lead (with its quotations and PPF vouchers) to another salesperson'],
  leadsAppointment: ['sales.leads.appointment', 'Set appointments on any lead in scope (own leads: with edit own leads)'],
  leadsConvertEscalated: ['sales.leads.convert_escalated', 'Convert a duplicate customer a salesperson sent to the Assistant Manager (its salesperson unavailable)'],
  teamManage: ['sales.team.manage', 'Manage the sales team: create staff in sales roles, reset passwords, deactivate leavers'],
  reportsView: ['sales.reports.view', 'Sales team report: track record per person, walk-ins, orders'],

  ordersViewAll: ['sales.orders.view_all', 'View all sales orders in scope'],
  ordersViewOwn: ['sales.orders.view_own', 'View own sales orders'],
  ordersCreate: ['sales.orders.create', 'Raise sales orders (PBO / CBO) from converted leads'],
  ordersUpdate: ['sales.orders.update', 'Edit draft sales orders and their vehicle identifiers'],
  ordersUpdateOwn: ['sales.orders.update_own', 'Edit own draft sales orders'],
  ordersSubmit: ['sales.orders.submit', 'Submit sales orders for approval'],
  ordersApprove: ['sales.orders.approve', 'Approve or return sales orders'],
  ordersCancel: ['sales.orders.cancel', 'Cancel sales orders'],
  ordersAllocate: ['sales.orders.allocate', 'Allocate stock vehicles and move them through logistics'],
  ordersDispatch: ['sales.orders.dispatch', 'Mark the car of an approved order in transit (dispatched from the plant / head office)'],

  stockView: ['sales.stock.view', 'View the dealership open stock (undelivered vehicles)'],
  stockManage: ['sales.stock.manage', 'Register incoming stock vehicles and correct their details'],

  quotationsViewAll: ['sales.quotations.view_all', 'View, download and print every vehicle quotation in scope'],
  quotationsViewOwn: ['sales.quotations.view_own', 'View, download and print quotations of your own leads'],
  quotationsCreate: ['sales.quotations.create', 'Issue vehicle quotations (own leads, or any lead with the edit-all right)'],
  quotationsUpdate: ['sales.quotations.update', 'Correct any vehicle quotation in scope'],
  quotationsUpdateOwn: ['sales.quotations.update_own', 'Correct quotations of your own leads'],

  variantsView: ['sales.variants.view', "See the dealership's variant codes (to pick the vehicle on a quotation)"],
  templatesManage: ['sales.templates.manage', "Edit the dealership's document formats (quotation and PPF voucher) and its variant codes"],

  ppfViewAll: ['sales.ppf.view_all', 'View, download and print every Paint Protection Film form in scope'],
  ppfViewOwn: ['sales.ppf.view_own', 'View, download and print PPF forms of your own leads'],
  ppfCreate: ['sales.ppf.create', 'Fill in PPF forms when the customer agrees (own leads, or any lead with the edit-all right)'],
  ppfUpdate: ['sales.ppf.update', 'Correct any PPF form in scope'],
  ppfUpdateOwn: ['sales.ppf.update_own', 'Correct PPF forms of your own leads'],

  deliveriesViewAll: ['sales.deliveries.view_all', 'View all deliveries in scope'],
  deliveriesViewOwn: ['sales.deliveries.view_own', 'View own deliveries'],
  deliveriesSchedule: ['sales.deliveries.schedule', 'Schedule and cancel deliveries'],
  deliveriesComplete: ['sales.deliveries.complete', 'Complete deliveries (hands over and activates the vehicle)'],
});
