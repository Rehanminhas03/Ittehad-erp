/**
 * Sales feature — everything Sales lives in this folder:
 *   leads/       lead list, form and detail (follow-ups, Convert to Lead, duplicate escalation, raise order)
 *   orders/      sales orders (PBO / CBO), vehicle chassis / engine number, delivery scheduling
 *   deliveries/  hand-over to the customer
 *   stock/       open stock (Delivery Team registers incoming vehicles)
 *   documents/   Vehicle quotations and PPF forms (issued from a lead; preview, download, print, correct)
 *   team/        Sales Manager's team report; monthly track record (cars booked / delivered, PPF sold)
 *   permissions.ts  permission codes and fixed lists;  salesApi.ts  API hooks (generated from the backend)
 * Routes are lazy-loaded by the app router (routes.tsx).
 */
export { P as SalesPermissions } from './permissions';
export { SalesDashboard } from './dashboard/SalesDashboard';
export { ActionBell } from './actions';
