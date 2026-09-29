import { z } from 'zod';
import { CustomerField, VehicleField } from '@/features/crm';
import { Badge, StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, idField, mono, muted, optionalId, optionalText, statusFilter, strong } from '@/shared/entity';
import { formatDateTime, formatNumber } from '@/shared/lib';
import { CheckInSummary } from '../components/CheckInSummary';
import { VehicleSchedulePanel } from '../components/VehicleSchedulePanel';
import { VisitJobCard } from '../components/VisitJobCard';
import { P, VISIT_STATES, VISIT_TYPES, ordinal, visitTypeLabel } from '../permissions';
import {
  type Visit,
  useCreateVisitMutation,
  useGetVisitHistoryQuery,
  useGetVisitQuery,
  useGetVisitWorkflowQuery,
  useListVisitsQuery,
  useTransitionVisitMutation,
  useUpdateVisitMutation,
} from '../serviceApi';

const serviceLabel = (v: Visit) => (v.serviceNumber ? `${ordinal(v.serviceNumber)} service` : visitTypeLabel(v.visitType));

export const visitView: EntityViewConfig<Visit> = {
  singular: 'Service visit',
  plural: 'Service visits',
  basePath: '/service/visits',
  entityType: 'service.visit',
  permissions: { view: [P.visitsView, P.visitsViewOwn], create: P.visitsCreate, update: [P.visitsUpdate] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'advisorId',
  list: {
    defaultSort: '-arrivedAt',
    searchPlaceholder: 'Search visit number',
    filters: [statusFilter(VISIT_STATES), dealershipFilter, { param: 'visitType', label: 'Type', type: 'select', options: VISIT_TYPES }],
    columns: [
      { key: 'visitNo', header: 'Visit', sortKey: 'visitNo', render: (v) => mono(v.visitNo) },
      { key: 'vehicleLabel', header: 'Vehicle', render: (v) => strong(v.vehicleLabel) },
      { key: 'customerName', header: 'Customer', render: (v) => v.customerName },
      {
        key: 'service',
        header: 'Service',
        render: (v) => (
          <>
            {serviceLabel(v)} {v.freeService && <Badge tone="green">Free</Badge>}
          </>
        ),
      },
      { key: 'arrivedAt', header: 'Arrived', sortKey: 'arrivedAt', render: (v) => formatDateTime(v.arrivedAt) },
      { key: 'advisorName', header: 'Advisor', render: (v) => muted(v.advisorName) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (v) => <StatusBadge status={v.status} /> },
    ],
  },
  detail: {
    title: (v) => v.visitNo,
    subtitle: (v) => `${v.vehicleLabel ?? ''} · ${v.customerName ?? ''} · ${ordinal(v.visitSequence)} visit`,
    fields: [
      { label: 'Vehicle', value: (v) => v.vehicleLabel },
      { label: 'Customer', value: (v) => v.customerName },
      { label: 'Type', value: (v) => visitTypeLabel(v.visitType) },
      { label: 'Service', value: (v) => serviceLabel(v) },
      { label: 'Charge', value: (v) => (v.freeService ? <Badge tone="green">Free scheduled service</Badge> : 'Chargeable') },
      { label: 'Warranty', value: (v) => (v.warrantyValid ? <Badge tone="green">Valid</Badge> : 'Not covered') },
      { label: 'Odometer', value: (v) => `${formatNumber(v.odometerKm)} km` },
      { label: 'Arrived', value: (v) => formatDateTime(v.arrivedAt) },
      { label: 'Promised', value: (v) => formatDateTime(v.promisedAt) },
      { label: 'Complaints', value: (v) => v.complaints },
      { label: 'Advisor', value: (v) => v.advisorName },
      { label: 'Handed back', value: (v) => formatDateTime(v.deliveredAt) },
    ],
    sections: (v) => (
      <>
        <VisitJobCard visit={v} />
        <VehicleSchedulePanel vehicleId={v.vehicleId} />
      </>
    ),
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.visitsCreate },
      { name: 'branchId', label: 'Branch', type: 'branch', dealershipField: 'dealershipId', scopePermission: P.visitsCreate, mode: 'create' },
      {
        name: 'vehicleId',
        label: 'Vehicle',
        type: 'custom',
        required: true,
        span: 2,
        mode: 'create',
        dealershipField: 'dealershipId',
        render: ({ id, value, onChange, values }) => (
          <div className="space-y-3">
            <VehicleField id={id} value={value} onChange={onChange} />
            <CheckInSummary vehicleId={Number(value) || null} dealershipId={Number(values.dealershipId) || null} />
          </div>
        ),
      },
      { name: 'visitType', label: 'Visit type', type: 'select', required: true, mode: 'create', options: VISIT_TYPES },
      { name: 'odometerKm', label: 'Odometer (km)', type: 'number', required: true, mode: 'create' },
      {
        name: 'customerId',
        label: 'Customer',
        type: 'custom',
        span: 2,
        mode: 'create',
        dealershipField: 'dealershipId',
        hint: 'Leave empty to use the owner on record at this dealership',
        render: ({ id, value, onChange, values }) => (
          <CustomerField id={id} value={value} onChange={onChange} permission="master.customers.view" dealershipId={Number(values.dealershipId) || null} />
        ),
      },
      { name: 'complaints', label: 'Customer complaints / requests', type: 'textarea', span: 2 },
    ],
    defaults: { visitType: 'scheduled' },
    createSchema: z.object({
      dealershipId: idField('Dealership'),
      branchId: optionalId(),
      vehicleId: idField('Vehicle'),
      customerId: optionalId(),
      visitType: z.enum(VISIT_TYPES.map((t) => t.value) as [string, ...string[]]),
      odometerKm: z.coerce.number({ error: 'Odometer is required' }).int().min(0).max(2_000_000),
      complaints: optionalText(4000),
    }),
    updateSchema: z.object({ complaints: optionalText(4000) }),
  },
  api: {
    useList: useListVisitsQuery,
    useGet: useGetVisitQuery,
    useHistory: useGetVisitHistoryQuery,
    create: { useMutation: useCreateVisitMutation, toArg: (v) => ({ visitCreate: v }) },
    update: { useMutation: useUpdateVisitMutation, toArg: (id, v) => ({ id, visitUpdate: v }) },
  },
  workflow: {
    useDefinition: useGetVisitWorkflowQuery,
    transition: { useMutation: useTransitionVisitMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};
