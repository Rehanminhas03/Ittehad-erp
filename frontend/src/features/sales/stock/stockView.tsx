import { Link } from 'react-router';
import { z } from 'zod';
import { useVehicleModelOptions, VEHICLE_STATUSES } from '@/features/crm';
import { StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, idField, mono, muted, optionalId, optionalText, strong } from '@/shared/entity';
import { formatDateTime } from '@/shared/lib';
import { LeadModelSelect } from '../leads/components/LeadModelSelect';
import { VariantPicker } from '../leads/components/VariantPicker';
import { PdiChoices, pdiBody, type PdiChoice } from '../orders/components/OrderPdi';
import { PdiBadge, StockPdi } from './StockPdi';
import { P } from '../permissions';
import {
  type StockVehicle,
  useGetStockVehicleHistoryQuery,
  useGetStockVehicleQuery,
  useListStockVehiclesQuery,
  useReceiveStockVehicleMutation,
  useUpdateStockVehicleMutation,
} from '../salesApi';
import { WaitingOrderSelect } from './WaitingOrderSelect';

const chassis = z
  .string()
  .trim()
  .refine((v) => v.replace(/[^A-Za-z0-9]/g, '').length >= 3, 'Enter the chassis number');
const modelYear = z
  .union([z.literal(''), z.coerce.number().int().min(1950).max(2100)])
  .transform((v) => (v === '' ? null : v));

const fields = {
  modelId: idField('Model'),
  vin: chassis,
  engineNo: z
    .string()
    .trim()
    .refine((v) => v.replace(/[^A-Za-z0-9]/g, '').length >= 3, 'Enter the engine number'),
  variant: optionalText(160),
  color: optionalText(40),
  modelYear,
  notes: optionalText(2000),
};

/**
 * Open stock (Delivery Team): the dealership's undelivered vehicles. An arriving car is registered
 * here for the booked order it came for (linked and marked Received), or as Available (free) stock
 * to be allocated from an order later; delivery removes it.
 */
export const stockView: EntityViewConfig<StockVehicle> = {
  singular: 'Stock vehicle',
  plural: 'Open stock',
  basePath: '/sales/stock',
  entityType: 'sales.stock_vehicle',
  permissions: { view: [P.stockView], create: P.stockManage, update: [P.stockManage] },
  // Stock belongs to dealerships through its links; the server checks the dealership on every write.
  canEdit: (_v, perm) => perm.can(P.stockManage),
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search chassis, engine, registration, PBO or customer',
    filters: [
      { param: 'status', label: 'Status', type: 'select', options: VEHICLE_STATUSES.filter((s) => s.value !== 'delivered') },
      { param: 'allocated', label: 'On an order', type: 'boolean' },
      { param: 'modelId', label: 'Model', type: 'select', useOptions: useVehicleModelOptions },
      dealershipFilter,
    ],
    columns: [
      { key: 'vin', header: 'Chassis no.', sortKey: 'vin', render: (v) => mono(v.vin) },
      { key: 'engineNo', header: 'Engine no.', render: (v) => mono(v.engineNo) },
      { key: 'modelName', header: 'Model', render: (v) => strong([v.modelName, v.variant].filter(Boolean).join(' ')) },
      { key: 'color', header: 'Colour', render: (v) => muted(v.color) },
      { key: 'modelYear', header: 'Year', sortKey: 'modelYear', render: (v) => v.modelYear ?? '—' },
      { key: 'status', header: 'Status', sortKey: 'status', render: (v) => <StatusBadge status={v.status} /> },
      { key: 'pdiStatus', header: 'PDI', render: (v) => <PdiBadge status={v.pdiStatus} /> },
      { key: 'orderNo', header: 'Order', render: (v) => (v.orderNo ? <span className="font-mono text-xs">{v.orderNo}</span> : muted('Free')) },
      { key: 'customerName', header: 'Customer', render: (v) => muted(v.customerName) },
    ],
  },
  detail: {
    sections: (v) => <StockPdi v={v} />,
    title: (v) => v.vin ?? v.engineNo ?? 'Stock vehicle',
    subtitle: (v) => [v.modelName, v.variant, v.color, v.modelYear].filter(Boolean).join(' · '),
    fields: [
      { label: 'Status', value: (v) => <StatusBadge status={v.status} /> },
      { label: 'Chassis no.', value: (v) => mono(v.vin) },
      { label: 'Engine no.', value: (v) => mono(v.engineNo) },
      { label: 'Model', value: (v) => [v.modelName, v.variant].filter(Boolean).join(' ') },
      { label: 'Colour', value: (v) => v.color },
      { label: 'Model year', value: (v) => v.modelYear },
      { label: 'Dealership', value: (v) => v.dealershipName },
      {
        label: 'Sales order',
        value: (v) =>
          v.orderId ? (
            <Link to={`/sales/orders/${v.orderId}`} className="text-brand-700 hover:underline">
              {v.orderNo} · {v.customerName}
            </Link>
          ) : (
            'Free stock'
          ),
      },
      { label: 'PDI', value: (v) => <PdiBadge status={v.pdiStatus} /> },
      { label: 'Notes', value: (v) => v.notes },
      { label: 'Registered', value: (v) => formatDateTime(v.createdAt) },
    ],
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.stockManage },
      // The dealership's own brand only (Hyundai Islamabad: Hyundai models).
      {
        name: 'modelId',
        label: 'Model',
        type: 'custom',
        required: true,
        render: ({ id, value, onChange, invalid, values }) => (
          <LeadModelSelect id={id} value={String(value ?? '')} onChange={onChange} invalid={invalid} dealershipId={Number(values.dealershipId) || null} access={[P.stockManage]} />
        ),
      },
      // The booked order this car arrived for (oldest waiting first, preselected); none: free stock.
      {
        name: 'orderId',
        label: 'For order',
        type: 'custom',
        mode: 'create',
        span: 2,
        hint: 'Open the list and search by customer name, PBO or order number. The car is linked to the order you pick and marked Received; choose "Open stock" to keep it as free stock.',
        render: ({ id, value, onChange, values, setValues }) => (
          <WaitingOrderSelect id={id} value={String(value ?? '')} onChange={onChange} setValues={setValues} dealershipId={Number(values.dealershipId) || null} modelId={Number(values.modelId) || null} colour={String(values.color ?? '')} variant={String(values.variant ?? '')} />
        ),
      },
      { name: 'vin', label: 'Chassis number (VIN)', type: 'text', required: true },
      { name: 'engineNo', label: 'Engine number', type: 'text', required: true },
      {
        name: 'variant',
        label: 'Variant',
        type: 'custom',
        render: ({ id, value, onChange, invalid, values }) => (
          <VariantPicker id={id} value={String(value ?? '')} onChange={onChange} invalid={invalid} modelId={Number(values.modelId) || null} dealershipId={Number(values.dealershipId) || null} />
        ),
      },
      { name: 'color', label: 'Colour', type: 'text' },
      { name: 'modelYear', label: 'Model year', type: 'number' },
      // The PDI is entered when the car is received: done, pending, or not clear (with the issue).
      {
        name: 'pdiStatus',
        label: 'PDI (pre-delivery inspection)',
        type: 'custom',
        span: 2,
        mode: 'create',
        required: true,
        render: ({ value, onChange, invalid, values, setValues }) => (
          <PdiChoices
            choice={(value as PdiChoice | undefined) ?? ''}
            onChoice={(c) => onChange(c)}
            notes={String(values.pdiIssue ?? '')}
            onNotes={(n) => setValues({ pdiIssue: n })}
            invalid={invalid}
          />
        ),
      },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    createSchema: z
      .object({ dealershipId: idField('Dealership'), orderId: optionalId(), ...fields, pdiStatus: z.enum(['done', 'pending', 'issue'], { error: 'Choose: PDI done, PDI pending, or PDI not clear' }), pdiIssue: optionalText(2000) })
      .superRefine((v, c) => {
        if (v.pdiStatus === 'issue' && !String(v.pdiIssue ?? '').trim()) c.addIssue({ code: 'custom', path: ['pdiStatus'], message: 'Describe the issue found in the PDI' });
      }),
    updateSchema: z.object(fields),
    toFormValues: (v) => ({ ...v, modelId: String(v.modelId) }),
  },
  api: {
    useList: useListStockVehiclesQuery,
    useGet: useGetStockVehicleQuery,
    useHistory: useGetStockVehicleHistoryQuery,
    create: {
      useMutation: useReceiveStockVehicleMutation,
      toArg: ({ pdiStatus, pdiIssue, ...v }) => ({ stockVehicleCreate: { ...v, pdi: pdiBody(pdiStatus as PdiChoice, String(pdiIssue ?? '')) } }),
    },
    update: { useMutation: useUpdateStockVehicleMutation, toArg: (id, v) => ({ id, stockVehicleUpdate: v }) },
  },
};
