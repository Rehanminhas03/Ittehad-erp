import { definePermissions } from '../../auth/permissions';

export const AccountsPerm = definePermissions('accounts', {
  chartView: ['accounts.chart.view', 'View the chart of accounts'],
  chartManage: ['accounts.chart.manage', 'Add and edit accounts'],
  journalsView: ['accounts.journals.view', 'View journal entries and the general ledger'],
  journalsPost: ['accounts.journals.post', 'Post manual journal entries and reversals'],
  invoicesView: ['accounts.invoices.view', 'View invoices'],
  invoicesCreate: ['accounts.invoices.create', 'Create draft invoices from sales orders and job cards'],
  invoicesIssue: ['accounts.invoices.issue', 'Issue invoices (posts to the ledger)'],
  invoicesVoid: ['accounts.invoices.void', 'Void unpaid invoices (posts a reversal)'],
  paymentsView: ['accounts.payments.view', 'View payments'],
  paymentsCreate: ['accounts.payments.create', 'Record customer receipts and supplier payments'],
  paymentsVoid: ['accounts.payments.void', 'Void payments (posts a reversal)'],
  reportsView: ['accounts.reports.view', 'Trial balance, receivables and payables'],
});
