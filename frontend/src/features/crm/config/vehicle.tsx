import { z } from 'zod';
import { VehicleSchedulePanel } from '@/features/service';
import { type BadgeTone, StatusBadge } from '@/shared/components/ui';
import { isModuleEnabled } from '@/shared/config';
import { type EntityViewConfig, idField, mono, muted, optionalId, optionalText, strong } from '@/shared/entity';
import { formatDateTime } from '@/shared/lib';
import { LinkVehicleNotice } from '../components/LinkVehicleNotice';
import { VehicleOwnership } from '../components/VehicleOwnership';
import {
  type Vehicle,
  useCreateVehicleMutation,
  useGetVehicleHistoryQuery,
  useGetVehicleQuery,
  useListVehiclesQuery,
  useUpdateVehicleMutation,
} from '../crmApi';
import { useVehicleModelOptions } from '../hooks/useVehicleModelOptions';
import { P, VEHICLE_STATUSES } from '../permissions';

const identifier = (label: string, min: number) =>
  z
    .string()
    .trim()
    .refine((v) => v.replace(/[^a-z0-9]/gi, '').length >= min, `${label} needs at least ${min} letters/digits`);
const optionalIdentifier = z
  .string()
  .trim()
  .transform((v) => v || null);
const modelYear = z
  .union([z.literal(''), z.coerce.number().int().min(1950).max(2100)])
  .transform((v) => (v === '' ? null : v));

const STATUS_TONES: Record<string, BadgeTone> = {
  available: 'green',
  reserved: 'amber',
  booked: 'blue',
  in_transit: 'amber',
  received: 'blue',
  ready_for_delivery: 'blue',
  delivered: 'green',
  transferred: 'gray',
  hold: 'red',
};

const shared = {
  vin: identifier('VIN / chassis number', 5),
  engineNo: optionalIdentifier,
  registrationNo: optionalIdentifier,
  modelId: idField('Model'),
  variant: optionalText(80),
  modelYear,
  color: optionalText(40),
  notes: optionalText(2000),
};

export const vehicleView: EntityViewConfig<Vehicle> = {
  singular: 'Vehicle',
  plural: 'Vehicles',
  basePath: '/crm/vehicles',
  entityType: 'master.vehicle',
  permissions: { view: [P.vehiclesView], create: P.vehiclesCreate, update: [P.vehiclesUpdate] },
  // Vehicles are shared group-wide and linked to dealerships; the server decides per link.
  canEdit: (v, perm) => (v.dealerships ?? []).some((d) => perm.canIn(P.vehiclesUpdate, d.id)),
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search VIN, registration or engine no.',
    filters: [{ param: 'status', label: 'Status', type: 'select', options: VEHICLE_STATUSES }],
    columns: [
      { key: 'registrationNo', header: 'Registration', sortKey: 'registrationNo', render: (v) => strong(v.registrationNo ?? 'Unregistered') },
      { key: 'vin', header: 'VIN / chassis', sortKey: 'vin', render: (v) => mono(v.vin) },
      { key: 'modelName', header: 'Model', render: (v) => [v.modelName, v.variant].filter(Boolean).join(' ') },
      { key: 'modelYear', header: 'Year', sortKey: 'modelYear', render: (v) => v.modelYear ?? '—' },
      { key: 'status', header: 'Status', sortKey: 'status', render: (v) => <StatusBadge status={v.status} tones={STATUS_TONES} /> },
      { key: 'owner', header: 'Current owner', render: (v) => muted(v.currentOwner?.fullName) },
    ],
  },
  detail: {
    title: (v) => v.registrationNo ?? v.vin ?? v.engineNo ?? 'Vehicle (pending identifiers)',
    subtitle: (v) => [v.modelName, v.variant, v.modelYear].filter(Boolean).join(' · '),
    fields: [
      { label: 'VIN / chassis', value: (v) => mono(v.vin) },
      { label: 'Engine no.', value: (v) => mono(v.engineNo) },
      { label: 'Registration', value: (v) => v.registrationNo },
      { label: 'Status', value: (v) => <StatusBadge status={v.status} tones={STATUS_TONES} /> },
      { label: 'Model', value: (v) => v.modelName },
      { label: 'Variant', value: (v) => v.variant },
      { label: 'Model year', value: (v) => v.modelYear },
      { label: 'Colour', value: (v) => v.color },
      { label: 'Dealerships', value: (v) => (v.dealerships ?? []).map((d) => d.name).join(', ') || '—' },
      { label: 'Notes', value: (v) => v.notes },
      { label: 'Registered', value: (v) => formatDateTime(v.createdAt) },
    ],
    sections: (v) => (
      <>
        <VehicleOwnership vehicle={v} />
        {isModuleEnabled('service') && <VehicleSchedulePanel vehicleId={v.id} />}
      </>
    ),
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.vehiclesCreate },
      { name: 'modelId', label: 'Model', type: 'select', required: true, useOptions: useVehicleModelOptions },
      { name: 'vin', label: 'VIN / chassis number', type: 'text', required: true, hint: 'Unique across the whole group' },
      { name: 'engineNo', label: 'Engine number', type: 'text' },
      { name: 'registrationNo', label: 'Registration number', type: 'text', placeholder: 'LEA-1234' },
      { name: 'variant', label: 'Variant', type: 'text' },
      { name: 'modelYear', label: 'Model year', type: 'number' },
      { name: 'color', label: 'Colour', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({ dealershipId: idField('Dealership'), ...shared, ownerCustomerId: optionalId() }),
    updateSchema: z.object(shared),
    // Registered at another dealership in the group: offer to link it instead of re-creating it.
    renderConflict: (details, values) =>
      details.linked === false ? (
        <LinkVehicleNotice dealershipId={Number(values.dealershipId)} identifier={String(values.vin)} />
      ) : undefined,
  },
  api: {
    useList: useListVehiclesQuery,
    useGet: useGetVehicleQuery,
    useHistory: useGetVehicleHistoryQuery,
    create: { useMutation: useCreateVehicleMutation, toArg: (v) => ({ vehicleCreate: v }) },
    update: { useMutation: useUpdateVehicleMutation, toArg: (id, v) => ({ id, vehicleUpdate: v }) },
  },
};
