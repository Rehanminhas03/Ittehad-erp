import { z } from 'zod';
import { StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, mono, optionalDate, optionalText, statusFilter, strong } from '@/shared/entity';
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib';
import { EstimateLines } from '../components/EstimateLines';
import { EstimatePrint } from '../components/EstimatePrint';
import { EstimatesReportButton } from '../components/EstimatesReport';
import { ESTIMATE_STATES, P } from '../permissions';
import {
  type Estimate,
  useGetEstimateHistoryQuery,
  useGetEstimateQuery,
  useGetEstimateWorkflowQuery,
  useListEstimatesQuery,
  useTransitionEstimateMutation,
  useUpdateEstimateMutation,
} from '../serviceApi';

/**
 * Estimates are separate from repair orders: made on their own ("New estimate", for a customer who only wants a price) or
 * from a job card, where approval (the customer agreed) adds the work to it. The store sees them and prices the parts.
 */
export const estimateView: EntityViewConfig<Estimate> = {
  singular: 'Estimate',
  plural: 'Estimates',
  basePath: '/service/estimates',
  entityType: 'service.estimate',
  permissions: { view: [P.estimatesView, P.estimatesViewOwn, P.estimatesStoreView], create: P.estimatesCreate, update: [P.estimatesUpdate] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'advisorId',
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search estimate number, customer or registration',
    createPath: '/service/estimates/new',
    createLabel: 'New estimate',
    // The report of the customers with estimates sits in the page header, left of "New estimate".
    headerActions: ({ query }) => (
      <div className="flex gap-2 [&>div]:mb-0">
        <EstimatesReportButton query={query} />
      </div>
    ),
    filters: [statusFilter(ESTIMATE_STATES), dealershipFilter],
    columns: [
      { key: 'estimateNo', header: 'Estimate', sortKey: 'estimateNo', render: (e) => mono(e.estimateNo) },
      { key: 'customerName', header: 'Customer', render: (e) => strong(e.customerName) },
      { key: 'vehicleLabel', header: 'Car', render: (e) => e.vehicleLabel ?? '—' },
      { key: 'jobCardNo', header: 'Job card', render: (e) => (e.jobCardNo ? mono(e.jobCardNo) : <span className="text-slate-400">On its own</span>) },
      { key: 'advisorName', header: 'Advisor', render: (e) => <span className="text-xs text-slate-600">{e.advisorName ?? '—'}</span> },
      { key: 'totalAmount', header: 'Total', sortKey: 'totalAmount', className: 'text-right tabular-nums', render: (e) => formatMoney(e.totalAmount) },
      { key: 'createdAt', header: 'Created', sortKey: 'createdAt', render: (e) => formatDateTime(e.createdAt) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (e) => <StatusBadge status={e.status} /> },
    ],
  },
  detail: {
    title: (e) => e.estimateNo,
    subtitle: (e) => [e.customerName, e.vehicleLabel, e.jobCardNo].filter(Boolean).join(' · '),
    fields: [
      { label: 'Customer', value: (e) => e.customerName },
      { label: 'Mobile', value: (e) => e.customerMobile },
      { label: 'Car', value: (e) => e.vehicleLabel },
      { label: 'Variant', value: (e) => e.vehicleVariant },
      { label: 'VIN / chassis no.', value: (e) => e.vin },
      { label: 'Engine no.', value: (e) => e.engineNo },
      { label: 'Colour', value: (e) => e.color },
      { label: 'Job card', value: (e) => e.jobCardNo ?? 'None: an estimate on its own' },
      { label: 'Advisor', value: (e) => e.advisorName },
      { label: 'Total', value: (e) => <span className="font-semibold">{formatMoney(e.totalAmount)}</span> },
      { label: 'Valid until', value: (e) => formatDate(e.validUntil) },
      { label: 'Notes', value: (e) => e.notes },
    ],
    sections: (e) => (
      <>
        <div className="mb-3 flex justify-end">
          <EstimatePrint estimate={e} />
        </div>
        <EstimateLines estimate={e} />
      </>
    ),
  },
  form: {
    fields: [
      { name: 'customerName', label: 'Customer name', type: 'text', visible: (_p, row) => !!row && !(row as Estimate).jobCardId },
      { name: 'customerMobile', label: 'Mobile', type: 'tel', visible: (_p, row) => !!row && !(row as Estimate).jobCardId },
      { name: 'vehicleModel', label: 'Car (make and model)', type: 'text', visible: (_p, row) => !!row && !(row as Estimate).jobCardId },
      { name: 'registrationNo', label: 'Registration no.', type: 'text', visible: (_p, row) => !!row && !(row as Estimate).jobCardId },
      { name: 'vehicleVariant', label: 'Variant', type: 'text', visible: (_p, row) => !!row && !(row as Estimate).jobCardId },
      { name: 'vin', label: 'VIN / chassis no.', type: 'text', visible: (_p, row) => !!row && !(row as Estimate).jobCardId },
      { name: 'engineNo', label: 'Engine no.', type: 'text', visible: (_p, row) => !!row && !(row as Estimate).jobCardId },
      { name: 'color', label: 'Colour', type: 'text', visible: (_p, row) => !!row && !(row as Estimate).jobCardId },
      { name: 'validUntil', label: 'Valid until', type: 'date' },
      { name: 'notes', label: 'Notes for the customer', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({}),
    updateSchema: z.object({ customerName: optionalText(120), customerMobile: optionalText(30), vehicleModel: optionalText(80), registrationNo: optionalText(30), vehicleVariant: optionalText(120), vin: optionalText(40), engineNo: optionalText(40), color: optionalText(40), validUntil: optionalDate(), notes: optionalText(4000) }),
  },
  api: {
    useList: useListEstimatesQuery,
    useGet: useGetEstimateQuery,
    useHistory: useGetEstimateHistoryQuery,
    update: { useMutation: useUpdateEstimateMutation, toArg: (id, v) => ({ id, estimateUpdate: v }) },
  },
  workflow: {
    useDefinition: useGetEstimateWorkflowQuery,
    transition: { useMutation: useTransitionEstimateMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};
