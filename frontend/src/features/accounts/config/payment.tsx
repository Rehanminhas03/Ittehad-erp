import { Link } from 'react-router';
import { StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, mono, muted, statusFilter, strong } from '@/shared/entity';
import { formatDate, formatMoney } from '@/shared/lib';
import {
  type Payment,
  useGetPaymentHistoryQuery,
  useGetPaymentQuery,
  useGetPaymentWorkflowQuery,
  useListPaymentsQuery,
  useTransitionPaymentMutation,
} from '../accountsApi';
import { PaymentAllocations } from '../components/PaymentAllocations';
import { PostingSection } from '../components/PostingSection';
import { labelOf, P, PAYMENT_METHODS } from '../permissions';

const DIRECTIONS = [
  { value: 'receipt', label: 'Customer receipt' },
  { value: 'disbursement', label: 'Supplier payment' },
];
const party = (p: Payment) => p.customerName ?? p.supplierName;

/** Customer receipts and supplier payments. Posted when recorded; voiding posts the reversal. */
export const paymentView: EntityViewConfig<Payment> = {
  singular: 'Payment',
  plural: 'Payments',
  basePath: '/accounts/payments',
  entityType: 'accounts.payment',
  permissions: { view: [P.paymentsView], create: P.paymentsCreate },
  scope: { dealershipKey: 'dealershipId' },
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search payment number or reference',
    createPath: '/accounts/payments/new',
    filters: [
      { param: 'direction', label: 'Type', type: 'select', options: DIRECTIONS },
      { param: 'method', label: 'Method', type: 'select', options: PAYMENT_METHODS },
      statusFilter(['posted', 'void']),
      dealershipFilter,
    ],
    columns: [
      { key: 'paymentNo', header: 'Number', sortKey: 'paymentNo', render: (p) => mono(p.paymentNo) },
      { key: 'paymentDate', header: 'Date', sortKey: 'paymentDate', render: (p) => formatDate(p.paymentDate) },
      { key: 'party', header: 'From / to', render: (p) => strong(party(p)) },
      { key: 'direction', header: 'Type', render: (p) => muted(labelOf(DIRECTIONS, p.direction)) },
      { key: 'method', header: 'Method', render: (p) => `${labelOf(PAYMENT_METHODS, p.method)}${p.reference ? ` · ${p.reference}` : ''}` },
      {
        key: 'amount',
        header: 'Amount',
        sortKey: 'amount',
        className: 'text-right tabular-nums',
        render: (p) => <span className={p.direction === 'receipt' ? 'text-emerald-700' : 'text-slate-900'}>{formatMoney(p.amount)}</span>,
      },
      { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    ],
  },
  detail: {
    title: (p) => p.paymentNo,
    subtitle: (p) => `${labelOf(DIRECTIONS, p.direction)} · ${party(p) ?? ''}`,
    fields: [
      {
        label: 'From / to',
        value: (p) =>
          p.customerId ? (
            <Link to={`/crm/customers/${p.customerId}`} className="text-brand-700 hover:underline">{p.customerName}</Link>
          ) : (
            <Link to={`/parts/suppliers/${p.supplierId}`} className="text-brand-700 hover:underline">{p.supplierName}</Link>
          ),
      },
      { label: 'Date', value: (p) => formatDate(p.paymentDate) },
      { label: 'Method', value: (p) => labelOf(PAYMENT_METHODS, p.method) },
      { label: 'Reference', value: (p) => p.reference },
      { label: 'Amount', value: (p) => <span className="font-semibold">{formatMoney(p.amount)}</span> },
      { label: 'Notes', value: (p) => p.notes },
    ],
    sections: (p) => (
      <>
        <PaymentAllocations payment={p} />
        <PostingSection entryId={p.journalEntryId} />
      </>
    ),
  },
  api: { useList: useListPaymentsQuery, useGet: useGetPaymentQuery, useHistory: useGetPaymentHistoryQuery },
  workflow: {
    useDefinition: useGetPaymentWorkflowQuery,
    transition: { useMutation: useTransitionPaymentMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};
