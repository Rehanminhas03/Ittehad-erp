import { Badge, StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, mono, muted, statusFilter, strong } from '@/shared/entity';
import { formatDate, formatDateTime } from '@/shared/lib';
import { DeliveryNoteButton } from '../documents/DocumentPreview';
import { DeliveryCompletion } from './components/DeliveryCompletion';
import { DELIVERY_DOCUMENTS, DELIVERY_STATES, P, PDI_CHECKLIST } from '../permissions';
import {
  type Delivery,
  useGetDeliveryHistoryQuery,
  useGetDeliveryQuery,
  useGetDeliveryWorkflowQuery,
  useListDeliveriesQuery,
  useTransitionDeliveryMutation,
} from '../salesApi';

const docLabel = (v: string) => DELIVERY_DOCUMENTS.find((d) => d.value === v)?.label ?? v;

/** Deliveries are scheduled from an approved order and completed from their detail page. */
export const deliveryView: EntityViewConfig<Delivery> = {
  singular: 'Delivery',
  plural: 'Deliveries',
  basePath: '/sales/deliveries',
  entityType: 'sales.delivery',
  permissions: { view: [P.deliveriesViewAll, P.deliveriesViewOwn] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'salespersonId',
  list: {
    defaultSort: 'scheduledDate',
    searchPlaceholder: 'Search delivery, order or PBO number',
    filters: [
      statusFilter(DELIVERY_STATES),
      dealershipFilter,
      // Set by dashboard / "Action needed" links (shown as removable chips).
      { param: 'due', label: 'Due today or earlier', type: 'hidden' },
      { param: 'deliveredFrom', label: 'Delivered from', type: 'hidden', chip: (v) => `Delivered from ${formatDate(v)}` },
      { param: 'deliveredTo', label: 'Delivered to', type: 'hidden', chip: (v) => `Delivered up to ${formatDate(v)}` },
    ],
    columns: [
      { key: 'deliveryNo', header: 'Delivery', sortKey: 'deliveryNo', render: (d) => mono(d.deliveryNo) },
      { key: 'orderNo', header: 'Order', render: (d) => mono(d.orderNo) },
      { key: 'customerName', header: 'Customer', render: (d) => strong(d.customerName) },
      { key: 'vehicleLabel', header: 'Vehicle', render: (d) => d.vehicleLabel },
      { key: 'scheduledDate', header: 'Scheduled', sortKey: 'scheduledDate', render: (d) => formatDate(d.scheduledDate) },
      { key: 'deliveredOn', header: 'Delivered', sortKey: 'deliveredOn', render: (d) => muted(d.deliveredOn && formatDate(d.deliveredOn)) },
      { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
    ],
  },
  detail: {
    title: (d) => d.deliveryNo,
    subtitle: (d) => `${d.customerName ?? ''} · ${d.vehicleLabel ?? ''}`,
    fields: [
      { label: 'Order', value: (d) => d.orderNo },
      { label: 'Customer', value: (d) => d.customerName },
      { label: 'Vehicle', value: (d) => d.vehicleLabel },
      { label: 'Salesperson', value: (d) => d.salespersonName },
      { label: 'Scheduled', value: (d) => formatDate(d.scheduledDate) },
      { label: 'Delivered', value: (d) => (d.deliveredAt ? formatDateTime(d.deliveredAt) : '—') },
      { label: 'Odometer at delivery', value: (d) => (d.odometerKm == null ? '—' : `${d.odometerKm} km`) },
      {
        label: 'Pre-delivery checklist',
        value: (d) => (d.checklist?.length ? d.checklist.map((c) => PDI_CHECKLIST.find((x) => x.value === c)?.label ?? c).join(', ') : '—'),
      },
      {
        label: 'Documents handed over',
        value: (d) => (d.documentsHandedOver?.length ? d.documentsHandedOver.map(docLabel).join(', ') : '—'),
      },
      {
        label: 'Accessories handed over',
        value: (d) => (d.accessoriesHandedOver?.length ? d.accessoriesHandedOver.join(', ') : '—'),
      },
      {
        label: 'Customer acknowledgement',
        value: (d) =>
          d.customerAcknowledged ? (
            <Badge tone="green" dot>
              Acknowledged{d.customerAcknowledgedAt ? ` · ${formatDateTime(d.customerAcknowledgedAt)}` : ''}
            </Badge>
          ) : (
            '—'
          ),
      },
      { label: 'Notes', value: (d) => d.notes },
    ],
    sections: (d) => (
      <>
        {d.status !== 'cancelled' && (
          <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-slate-500">Print it for the customer to sign at hand-over.</span>
            <DeliveryNoteButton deliveryId={d.id} />
          </div>
        )}
        <DeliveryCompletion delivery={d} />
      </>
    ),
  },
  api: {
    useList: useListDeliveriesQuery,
    useGet: useGetDeliveryQuery,
    useHistory: useGetDeliveryHistoryQuery,
  },
  workflow: {
    useDefinition: useGetDeliveryWorkflowQuery,
    transition: { useMutation: useTransitionDeliveryMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};
