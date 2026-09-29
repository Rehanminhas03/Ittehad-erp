// Public surface of the accounts feature (routes are lazy-loaded by the app router).
// Sales orders and job cards embed SourceInvoice to raise their invoice.
export { SourceInvoice, type SourceInvoiceProps } from './components/SourceInvoice';
export { P as AccountsPermissions } from './permissions';
