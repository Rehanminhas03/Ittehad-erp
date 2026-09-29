import { Link } from 'react-router';
import { z } from 'zod';
import { StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, mono, muted, optionalText, statusFilter, strong } from '@/shared/entity';
import { formatDate, formatMoney } from '@/shared/lib';
import {
  type Invoice,
  useGetInvoiceHistoryQuery,
  useGetInvoiceQuery,
  useGetInvoiceWorkflowQuery,
  useListInvoicesQuery,
  useTransitionInvoiceMutation,
  useUpdateInvoiceMutation,
} from '../accountsApi';
import { InvoiceLines } from '../components/InvoiceLines';
import { InvoicePayments } from '../components/InvoicePayments';
import { PostingSection } from '../components/PostingSection';
import { INVOICE_STATES, P, sourceLink } from '../permissions';

const KINDS = [
  { value: 'vehicle_sale', label: 'Vehicle sale' },
  { value: 'service', label: 'Service' },
];
const outstanding = (i: Invoice) => Number(i.totalAmount) - Number(i.amountPaid);
const overdue = (i: Invoice) => ['issued', 'partially_paid'].includes(i.status) && i.dueDate < new Date().toISOString().slice(0, 10);

/**
 * One invoicing engine for vehicle sales and service. Drafted from an approved sales order or a
 * completed job card; issuing posts it to the ledger; voiding posts the reversal.
 */
export const invoiceView: EntityViewConfig<Invoice> = {
  singular: 'Invoice',
  plural: 'Invoices',
  basePath: '/accounts/invoices',
  entityType: 'accounts.invoice',
  permissions: { view: [P.invoicesView], update: [P.invoicesCreate] },
  scope: { dealershipKey: 'dealershipId' },
  canEdit: (i, perm) => i.status === 'draft' && perm.canIn(P.invoicesCreate, i.dealershipId),
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search invoice or order / job card number',
    filters: [statusFilter(INVOICE_STATES), { param: 'kind', label: 'Kind', type: 'select', options: KINDS }, dealershipFilter],
    columns: [
      { key: 'invoiceNo', header: 'Invoice', sortKey: 'invoiceNo', render: (i) => mono(i.invoiceNo) },
      { key: 'customerName', header: 'Customer', render: (i) => strong(i.customerName) },
      { key: 'sourceNo', header: 'For', render: (i) => muted(i.sourceNo) },
      { key: 'invoiceDate', header: 'Date', sortKey: 'invoiceDate', render: (i) => formatDate(i.invoiceDate) },
      {
        key: 'dueDate',
        header: 'Due',
        sortKey: 'dueDate',
        render: (i) => <span className={overdue(i) ? 'font-medium text-red-600' : undefined}>{formatDate(i.dueDate)}</span>,
      },
      { key: 'totalAmount', header: 'Total', sortKey: 'totalAmount', className: 'text-right tabular-nums', render: (i) => formatMoney(i.totalAmount) },
      { key: 'balance', header: 'Balance', className: 'text-right tabular-nums', render: (i) => (outstanding(i) > 0 && !['void', 'cancelled'].includes(i.status) ? formatMoney(outstanding(i)) : muted('—')) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (i) => <StatusBadge status={i.status} /> },
    ],
  },
  detail: {
    title: (i) => i.invoiceNo,
    subtitle: (i) => `${i.customerName ?? ''} · ${i.kind === 'service' ? 'Service' : 'Vehicle sale'}`,
    fields: [
      { label: 'Customer', value: (i) => <Link to={`/crm/customers/${i.customerId}`} className="text-brand-700 hover:underline">{i.customerName}</Link> },
      {
        label: 'For',
        value: (i) => {
          const to = sourceLink(i.sourceType, i.sourceId);
          return to ? <Link to={to} className="font-mono text-xs text-brand-700 hover:underline">{i.sourceNo}</Link> : i.sourceNo;
        },
      },
      { label: 'Invoice date', value: (i) => formatDate(i.invoiceDate) },
      { label: 'Due', value: (i) => <span className={overdue(i) ? 'font-medium text-red-600' : undefined}>{formatDate(i.dueDate)}</span> },
      { label: 'Total', value: (i) => <span className="font-semibold">{formatMoney(i.totalAmount)}</span> },
      { label: 'Paid', value: (i) => formatMoney(i.amountPaid) },
      { label: 'Notes', value: (i) => i.notes },
    ],
    sections: (i) => (
      <>
        <InvoiceLines invoice={i} />
        <InvoicePayments key={i.amountPaid} invoice={i} />
        <PostingSection entryId={i.journalEntryId} />
      </>
    ),
  },
  form: {
    fields: [
      { name: 'dueDate', label: 'Due date', type: 'date', required: true },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({}),
    updateSchema: z.object({ dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'), notes: optionalText(2000) }),
  },
  api: {
    useList: useListInvoicesQuery,
    useGet: useGetInvoiceQuery,
    useHistory: useGetInvoiceHistoryQuery,
    update: { useMutation: useUpdateInvoiceMutation, toArg: (id, v) => ({ id, invoiceUpdate: v }) },
  },
  workflow: {
    useDefinition: useGetInvoiceWorkflowQuery,
    transition: { useMutation: useTransitionInvoiceMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};
