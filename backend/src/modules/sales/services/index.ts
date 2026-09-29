// Sales business operations, one file per stage of the journey:
//   dashboard.ts   the signed-in user's home dashboard (counts + daily series, own scope)
//   actionItems.ts "Action needed": what is waiting for the signed-in person (bell, dashboard, pop-up)
//   leads.ts       follow-ups, Convert to Lead, duplicate-phone escalation
//   orders.ts      Admin raises the order; vehicle identifiers; stock allocation (Delivery Team phase)
//   deliveries.ts  schedule and complete the hand-over
//   documents.ts   Vehicle quotations and PPF forms issued from a lead (stored, editable, printable)
//   stock.ts       Open stock: the Delivery Team registers incoming vehicles
//   teamReport.ts  Sales Manager's department report
//   templates.ts   Quotation format per dealership (letterhead, terms, sign-off), edited by the AM / Manager
//   variants.ts    Variant codes pasted from Excel (Hyundai)
//   trackRecord.ts Monthly cars booked / delivered, PPF sold (count and amount), quotations; per salesperson
// Plain CRUD (list / get / create / update / workflow actions) comes from the entity configs in ../entities.ts.
export { deliveries, leads, orders, ppfForms, quotations, stock, variants } from '../entities';
export * from './actionItems';
export * from './dashboard';
export * from './deliveries';
export * from './leads';
export * from './orders';
export * from './documents';
export * from './stock';
export * from './teamReport';
export * from './templates';
export * from './trackRecord';
export * from './variants';
