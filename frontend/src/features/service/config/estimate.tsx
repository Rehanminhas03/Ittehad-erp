import { z } from 'zod';
import { StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, mono, optionalDate, optionalText, statusFilter, strong } from '@/shared/entity';
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib';
import { EstimateLines } from '../components/EstimateLines';
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

/** Estimates are created from a job card; approval (the customer agreed) adds the work to it. */
export const estimateView: EntityViewConfig<Estimate> = {
  singular: 'Estimate',
  plural: 'Estimates',
  basePath: '/service/estimates',
  entityType: 'service.estimate',
  permissions: { view: [P.estimatesView, P.estimatesViewOwn], update: [P.estimatesUpdate] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'advisorId',
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search estimate number',
    filters: [statusFilter(ESTIMATE_STATES), dealershipFilter],
    columns: [
      { key: 'estimateNo', header: 'Estimate', sortKey: 'estimateNo', render: (e) => mono(e.estimateNo) },
      { key: 'customerName', header: 'Customer', render: (e) => strong(e.customerName) },
      { key: 'jobCardNo', header: 'Job card', render: (e) => mono(e.jobCardNo) },
      { key: 'totalAmount', header: 'Total', sortKey: 'totalAmount', className: 'text-right tabular-nums', render: (e) => formatMoney(e.totalAmount) },
      { key: 'createdAt', header: 'Created', sortKey: 'createdAt', render: (e) => formatDateTime(e.createdAt) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (e) => <StatusBadge status={e.status} /> },
    ],
  },
  detail: {
    title: (e) => e.estimateNo,
    subtitle: (e) => `${e.customerName ?? ''} · ${e.jobCardNo ?? ''}`,
    fields: [
      { label: 'Customer', value: (e) => e.customerName },
      { label: 'Job card', value: (e) => e.jobCardNo },
      { label: 'Total', value: (e) => <span className="font-semibold">{formatMoney(e.totalAmount)}</span> },
      { label: 'Valid until', value: (e) => formatDate(e.validUntil) },
      { label: 'Notes', value: (e) => e.notes },
    ],
    sections: (e) => <EstimateLines estimate={e} />,
  },
  form: {
    fields: [
      { name: 'validUntil', label: 'Valid until', type: 'date' },
      { name: 'notes', label: 'Notes for the customer', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({}),
    updateSchema: z.object({ validUntil: optionalDate(), notes: optionalText(4000) }),
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
