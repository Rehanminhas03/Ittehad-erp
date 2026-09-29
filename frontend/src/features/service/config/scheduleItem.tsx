import { z } from 'zod';
import { useVehicleModelOptions } from '@/features/crm';
import { ActiveBadge, Badge } from '@/shared/components/ui';
import { activeFilter, type EntityViewConfig, idField, strong } from '@/shared/entity';
import { formatNumber } from '@/shared/lib';
import { P, ordinal } from '../permissions';
import {
  type ScheduleItem,
  useCreateScheduleItemMutation,
  useGetScheduleItemHistoryQuery,
  useGetScheduleItemQuery,
  useListScheduleItemsQuery,
  useUpdateScheduleItemMutation,
} from '../serviceApi';

const int = (label: string, max: number) => z.coerce.number({ error: `${label} is required` }).int().min(0).max(max);
const hours = z.string().trim().refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Hours like 1.5');

/** Per-model service schedule. Vehicles delivered after a change get the new schedule. */
export const scheduleItemView: EntityViewConfig<ScheduleItem> = {
  singular: 'Scheduled service',
  plural: 'Service schedules',
  basePath: '/service/setup/schedules',
  entityType: 'service.schedule_item',
  permissions: { view: [P.setupView], create: P.setupManage, update: [P.setupManage] },
  list: {
    defaultSort: 'sequence',
    searchPlaceholder: 'Search service name',
    filters: [{ param: 'modelId', label: 'Model', type: 'select', useOptions: useVehicleModelOptions }, activeFilter],
    columns: [
      { key: 'modelName', header: 'Model', render: (s) => strong(s.modelName) },
      { key: 'sequence', header: 'Service', sortKey: 'sequence', render: (s) => `${ordinal(s.sequence)} · ${s.name}` },
      { key: 'dueKm', header: 'Due at', sortKey: 'dueKm', render: (s) => `${formatNumber(s.dueKm)} km or ${s.dueMonths} months` },
      { key: 'isFree', header: 'Charge', render: (s) => (s.isFree ? <Badge tone="green">Free</Badge> : <Badge>Paid</Badge>) },
      { key: 'labourHours', header: 'Labour', render: (s) => `${Number(s.labourHours)} h` },
      { key: 'isActive', header: 'Status', render: (s) => <ActiveBadge active={s.isActive} /> },
    ],
  },
  detail: {
    title: (s) => `${s.modelName ?? ''} – ${ordinal(s.sequence)} service`,
    fields: [
      { label: 'Model', value: (s) => s.modelName },
      { label: 'Name', value: (s) => s.name },
      { label: 'Due at', value: (s) => `${formatNumber(s.dueKm)} km or ${s.dueMonths} months after delivery, whichever first` },
      { label: 'Charge', value: (s) => (s.isFree ? 'Free (within grace limits)' : 'Paid') },
      { label: 'Labour hours', value: (s) => s.labourHours },
      { label: 'Status', value: (s) => <ActiveBadge active={s.isActive} /> },
    ],
  },
  form: {
    fields: [
      { name: 'modelId', label: 'Model', type: 'select', required: true, mode: 'create', useOptions: useVehicleModelOptions },
      { name: 'sequence', label: 'Service number', type: 'number', required: true, hint: '1 for the 1st service, 2 for the 2nd…' },
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: '1st free service' },
      { name: 'dueKm', label: 'Due at (km)', type: 'number', required: true },
      { name: 'dueMonths', label: 'Due after (months)', type: 'number', required: true },
      { name: 'labourHours', label: 'Labour hours', type: 'text', required: true },
      { name: 'isFree', label: 'Free service', type: 'boolean' },
      { name: 'isActive', label: 'Active', type: 'boolean', mode: 'edit' },
    ],
    defaults: { labourHours: '1' },
    createSchema: z.object({
      modelId: idField('Model'),
      sequence: int('Service number', 100).min(1),
      name: z.string().trim().min(2).max(80),
      dueKm: int('Due km', 1_000_000),
      dueMonths: int('Due months', 240),
      labourHours: hours,
      isFree: z.boolean(),
    }),
    updateSchema: z.object({
      sequence: int('Service number', 100).min(1),
      name: z.string().trim().min(2).max(80),
      dueKm: int('Due km', 1_000_000),
      dueMonths: int('Due months', 240),
      labourHours: hours,
      isFree: z.boolean(),
      isActive: z.boolean(),
    }),
  },
  api: {
    useList: useListScheduleItemsQuery,
    useGet: useGetScheduleItemQuery,
    useHistory: useGetScheduleItemHistoryQuery,
    create: { useMutation: useCreateScheduleItemMutation, toArg: (v) => ({ scheduleItemCreate: v }) },
    update: { useMutation: useUpdateScheduleItemMutation, toArg: (id, v) => ({ id, scheduleItemUpdate: v }) },
  },
};
