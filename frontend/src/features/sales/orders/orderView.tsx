import { z } from 'zod';
import { Link } from 'react-router';
import { SourceInvoice } from '@/features/accounts';
import { useVehicleModelOptions, VEHICLE_STATUSES } from '@/features/crm';
import { StatusBadge } from '@/shared/components/ui';
import { isModuleEnabled } from '@/shared/config';
import {
  dealershipFilter,
  type EntityViewConfig,
  idField,
  mono,
  money,
  muted,
  optionalDate,
  optionalText,
  statusFilter,
  strong,
} from '@/shared/entity';
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib';
import { OrderDelivery } from './components/OrderDelivery';
import { OrderLogistics } from './components/OrderLogistics';
import { OrderVehicle } from './components/OrderVehicle';
import { labelOf, ORDER_STATES, ORDER_TYPES, P } from '../permissions';
import {
  type SalesOrder,
  useGetSalesOrderHistoryQuery,
  useGetSalesOrderQuery,
  useGetSalesOrderWorkflowQuery,
  useListSalesOrdersQuery,
  useTransitionSalesOrderMutation,
  useUpdateSalesOrderMutation,
} from '../salesApi';

const commercial = {
  modelId: idField('Model'),
  variant: optionalText(80),
  color: optionalText(40),
  unitPrice: money('Price'),
  discount: money('Discount'),
  bookingAmount: money('Booking amount'),
  expectedDeliveryDate: optionalDate(),
  financingRef: optionalText(80),
  paymentReference: optionalText(80),
  notes: optionalText(2000),
};

export const orderView: EntityViewConfig<SalesOrder> = {
  singular: 'Sales order',
  plural: 'Sales orders',
  basePath: '/sales/orders',
  entityType: 'sales.order',
  // Orders are raised by the Admin from a converted lead (see leads/components/LeadOrder), not created here.
  permissions: { view: [P.ordersViewAll, P.ordersViewOwn], update: [P.ordersUpdate, P.ordersUpdateOwn] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'salespersonId',
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search order number',
    filters: [statusFilter(ORDER_STATES), { param: 'live', label: 'Open (not delivered)', type: 'boolean' }, { param: 'awaitingApproval', label: 'Awaiting approval', type: 'boolean' }, { param: 'hasVehicle', label: 'Vehicle allocated', type: 'boolean' }, { param: 'vehicleStage', label: 'Car', type: 'select', options: [...VEHICLE_STATUSES] }, { param: 'orderType', label: 'Type', type: 'select', options: ORDER_TYPES }, dealershipFilter],
    columns: [
      { key: 'orderNo', header: 'Order', sortKey: 'orderNo', render: (o) => mono(o.orderNo) },
      { key: 'orderType', header: 'Type', render: (o) => o.orderType.toUpperCase() },
      { key: 'customerName', header: 'Customer', render: (o) => strong(o.customerName) },
      { key: 'modelName', header: 'Model', render: (o) => [o.modelName, o.variant].filter(Boolean).join(' ') },
      { key: 'totalAmount', header: 'Total', sortKey: 'totalAmount', className: 'text-right tabular-nums', render: (o) => formatMoney(o.totalAmount) },
      { key: 'salespersonName', header: 'Salesperson', render: (o) => muted(o.salespersonName) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (o) => <StatusBadge status={o.status} /> },
      { key: 'expectedDeliveryDate', header: 'Expected delivery', sortKey: 'expectedDeliveryDate', render: (o) => formatDate(o.expectedDeliveryDate) },
    ],
  },
  detail: {
    title: (o) => o.orderNo,
    subtitle: (o) => `${o.customerName ?? ''} · ${o.modelName ?? ''}`,
    fields: [
      { label: 'Status', value: (o) => <StatusBadge status={o.status} /> },
      { label: 'Order type', value: (o) => labelOf(ORDER_TYPES, o.orderType) },
      { label: 'Customer', value: (o) => o.customerName },
      { label: 'Salesperson', value: (o) => o.salespersonName },
      { label: 'Model', value: (o) => [o.modelName, o.variant, o.color].filter(Boolean).join(' · ') },
      { label: 'Price', value: (o) => formatMoney(o.unitPrice) },
      { label: 'Discount', value: (o) => formatMoney(o.discount) },
      { label: 'Total', value: (o) => <span className="font-semibold">{formatMoney(o.totalAmount)}</span> },
      { label: 'Booking amount', value: (o) => formatMoney(o.bookingAmount) },
      { label: 'Expected delivery', value: (o) => formatDate(o.expectedDeliveryDate) },
      { label: 'Payment reference', value: (o) => o.paymentReference },
      { label: 'Financing reference', value: (o) => o.financingRef },
      { label: 'Lead', value: (o) => (o.leadId ? <Link to={`/sales/leads/${o.leadId}`} className="text-brand-700 hover:underline">Open lead</Link> : null) },
      { label: 'Notes', value: (o) => o.notes },
      { label: 'Created', value: (o) => formatDateTime(o.createdAt) },
    ],
    sections: (o) => (
      <>
        <OrderVehicle order={o} />
        <OrderLogistics order={o} />
        <OrderDelivery order={o} />
        {isModuleEnabled('accounts') && (
          <SourceInvoice sourceType="sales_order" sourceId={o.id} dealershipId={o.dealershipId} ready={['approved', 'delivered'].includes(o.status)} />
        )}
      </>
    ),
  },
  form: {
    fields: [
      { name: 'modelId', label: 'Model', type: 'select', required: true, useOptions: useVehicleModelOptions },
      { name: 'variant', label: 'Variant', type: 'text' },
      { name: 'color', label: 'Colour', type: 'text' },
      { name: 'expectedDeliveryDate', label: 'Expected delivery', type: 'date' },
      { name: 'unitPrice', label: 'Price (PKR)', type: 'money', required: true },
      { name: 'discount', label: 'Discount (PKR)', type: 'money', hint: 'Limited by the group discount policy' },
      { name: 'bookingAmount', label: 'Booking amount (PKR)', type: 'money' },
      { name: 'paymentReference', label: 'Payment reference', type: 'text', hint: 'Pay order / cheque / transfer number' },
      { name: 'financingRef', label: 'Financing reference', type: 'text', hint: 'Bank / leasing company reference, if financed', span: 2 },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    defaults: { discount: '0', bookingAmount: '0' },
    createSchema: z.object(commercial),
  },
  api: {
    useList: useListSalesOrdersQuery,
    useGet: useGetSalesOrderQuery,
    useHistory: useGetSalesOrderHistoryQuery,
    update: { useMutation: useUpdateSalesOrderMutation, toArg: (id, v) => ({ id, salesOrderUpdate: v }) },
  },
  workflow: {
    useDefinition: useGetSalesOrderWorkflowQuery,
    transition: { useMutation: useTransitionSalesOrderMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};
