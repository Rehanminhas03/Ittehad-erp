import { z } from 'zod';
import { SourceInvoice } from '@/features/accounts';
import { JobCardPartsRequests } from '@/features/parts';
import { StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, mono, muted, optionalId, optionalText, statusFilter, strong } from '@/shared/entity';
import { formatDateTime } from '@/shared/lib';
import { InspectionPanel } from '../components/InspectionPanel';
import { JobCardEstimates } from '../components/JobCardEstimates';
import { JobCardWork } from '../components/JobCardWork';
import { TechnicianSelect } from '../components/TechnicianSelect';
import { JOB_CARD_STATES, P } from '../permissions';
import {
  type JobCard,
  useGetJobCardHistoryQuery,
  useGetJobCardQuery,
  useGetJobCardWorkflowQuery,
  useListJobCardsQuery,
  useTransitionJobCardMutation,
  useUpdateJobCardMutation,
} from '../serviceApi';

/** Job cards are opened from a visit; this screen is the workshop's working view. */
export const jobCardView: EntityViewConfig<JobCard> = {
  singular: 'Job card',
  plural: 'Job cards',
  basePath: '/service/job-cards',
  entityType: 'service.job_card',
  permissions: { view: [P.jobCardsView], update: [P.jobCardsUpdate] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search job card number',
    filters: [statusFilter(JOB_CARD_STATES), dealershipFilter],
    columns: [
      { key: 'jobCardNo', header: 'Job card', sortKey: 'jobCardNo', render: (j) => mono(j.jobCardNo) },
      { key: 'vehicleLabel', header: 'Vehicle', render: (j) => strong(j.vehicleLabel) },
      { key: 'visitNo', header: 'Visit', render: (j) => mono(j.visitNo) },
      { key: 'technicianName', header: 'Technician', render: (j) => muted(j.technicianName ?? 'Not assigned') },
      { key: 'createdAt', header: 'Opened', sortKey: 'createdAt', render: (j) => formatDateTime(j.createdAt) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (j) => <StatusBadge status={j.status} /> },
    ],
  },
  detail: {
    title: (j) => j.jobCardNo,
    subtitle: (j) => `${j.vehicleLabel ?? ''} · ${j.visitNo ?? ''}`,
    fields: [
      { label: 'Vehicle', value: (j) => j.vehicleLabel },
      { label: 'Visit', value: (j) => j.visitNo },
      { label: 'Advisor', value: (j) => j.advisorName },
      { label: 'Technician', value: (j) => j.technicianName ?? 'Not assigned' },
      { label: 'Started', value: (j) => formatDateTime(j.startedAt) },
      { label: 'Completed', value: (j) => formatDateTime(j.completedAt) },
      { label: 'Notes', value: (j) => j.notes },
    ],
    sections: (j) => (
      <>
        <JobCardWork jobCard={j} />
        <JobCardPartsRequests jobCard={j} />
        <InspectionPanel jobCard={j} />
        <JobCardEstimates jobCard={j} />
        <SourceInvoice sourceType="job_card" sourceId={j.id} dealershipId={j.dealershipId} ready={j.status === 'completed'} />
      </>
    ),
  },
  form: {
    fields: [
      {
        name: 'technicianId',
        label: 'Technician',
        type: 'custom',
        render: ({ id, value, onChange }) => <TechnicianSelect id={id} value={value} onChange={onChange} />,
      },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({}),
    updateSchema: z.object({ technicianId: optionalId(), notes: optionalText(4000) }),
  },
  api: {
    useList: useListJobCardsQuery,
    useGet: useGetJobCardQuery,
    useHistory: useGetJobCardHistoryQuery,
    update: { useMutation: useUpdateJobCardMutation, toArg: (id, v) => ({ id, jobCardUpdate: v }) },
  },
  workflow: {
    useDefinition: useGetJobCardWorkflowQuery,
    transition: { useMutation: useTransitionJobCardMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};
