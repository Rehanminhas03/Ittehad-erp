/** Permission codes used by the accounts screens (defined server-side in accounts/permissions.ts). */
export const P = {
  chartView: 'accounts.chart.view',
  chartManage: 'accounts.chart.manage',
  journalsView: 'accounts.journals.view',
  journalsPost: 'accounts.journals.post',
  invoicesView: 'accounts.invoices.view',
  invoicesCreate: 'accounts.invoices.create',
  invoicesIssue: 'accounts.invoices.issue',
  invoicesVoid: 'accounts.invoices.void',
  paymentsView: 'accounts.payments.view',
  paymentsCreate: 'accounts.payments.create',
  paymentsVoid: 'accounts.payments.void',
  reportsView: 'accounts.reports.view',
} as const;

export const INVOICE_STATES = ['draft', 'issued', 'partially_paid', 'paid', 'void', 'cancelled'] as const;
export const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
];
export const INVOICE_LINE_KINDS = [
  { value: 'other', label: 'Other charge' },
  { value: 'labour', label: 'Labour' },
  { value: 'part', label: 'Part' },
  { value: 'vehicle', label: 'Vehicle' },
];
export const JOURNAL_SOURCES = [
  { value: 'manual', label: 'Manual' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment', label: 'Payment' },
  { value: 'goods_receipt', label: 'Goods receipt' },
  { value: 'stock', label: 'Stock movement' },
];
export const labelOf = (list: { value: string; label: string }[], v: string | null | undefined) => list.find((x) => x.value === v)?.label ?? v ?? '—';

/** Where the business document behind an invoice / journal entry lives in the app. */
export function sourceLink(type: string | null | undefined, id: number | null | undefined): string | null {
  if (!type || !id) return null;
  const paths: Record<string, string> = {
    sales_order: '/sales/orders',
    job_card: '/service/job-cards',
    invoice: '/accounts/invoices',
    payment: '/accounts/payments',
    goods_receipt: '/parts/goods-receipts',
    parts_request: '/parts/requests',
    stock_adjustment: '/parts/adjustments',
    stock_transfer: '/parts/transfers',
  };
  return paths[type] ? `${paths[type]}/${id}` : null;
}
