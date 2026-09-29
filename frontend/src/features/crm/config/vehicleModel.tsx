import { z } from 'zod';
import { ActiveBadge } from '@/shared/components/ui';
import { activeFilter, type EntityViewConfig, muted, optionalText, requiredText, strong } from '@/shared/entity';
import {
  type VehicleModel,
  useCreateVehicleModelMutation,
  useGetVehicleModelHistoryQuery,
  useGetVehicleModelQuery,
  useListVehicleModelsQuery,
  useUpdateVehicleModelMutation,
} from '../crmApi';
import { P } from '../permissions';

/** Group-wide model catalogue (brand + model); service schedules are configured per model. */
export const vehicleModelView: EntityViewConfig<VehicleModel> = {
  singular: 'Vehicle model',
  plural: 'Vehicle models',
  basePath: '/crm/vehicle-models',
  entityType: 'master.vehicle_model',
  permissions: { view: [P.modelsView], create: P.modelsManage, update: [P.modelsManage] },
  list: {
    defaultSort: 'brand',
    searchPlaceholder: 'Search brand or model',
    filters: [activeFilter],
    columns: [
      { key: 'brand', header: 'Brand', sortKey: 'brand', render: (m) => strong(m.brand) },
      { key: 'name', header: 'Model', sortKey: 'name' },
      { key: 'bodyType', header: 'Body type', render: (m) => muted(m.bodyType) },
      { key: 'isActive', header: 'Status', render: (m) => <ActiveBadge active={m.isActive} /> },
    ],
  },
  detail: {
    title: (m) => `${m.brand} ${m.name}`,
    fields: [
      { label: 'Brand', value: (m) => m.brand },
      { label: 'Model', value: (m) => m.name },
      { label: 'Body type', value: (m) => m.bodyType },
      { label: 'Status', value: (m) => <ActiveBadge active={m.isActive} /> },
    ],
  },
  form: {
    fields: [
      { name: 'brand', label: 'Brand', type: 'text', required: true },
      { name: 'name', label: 'Model', type: 'text', required: true },
      { name: 'bodyType', label: 'Body type', type: 'text', placeholder: 'SUV, Sedan, Pickup…' },
      { name: 'isActive', label: 'Active (inactive models cannot be chosen for new vehicles)', type: 'boolean', mode: 'edit', span: 2 },
    ],
    createSchema: z.object({ brand: requiredText(2, 60), name: requiredText(1, 80), bodyType: optionalText(40) }),
    updateSchema: z.object({ brand: requiredText(2, 60), name: requiredText(1, 80), bodyType: optionalText(40), isActive: z.boolean() }),
  },
  api: {
    useList: useListVehicleModelsQuery,
    useGet: useGetVehicleModelQuery,
    useHistory: useGetVehicleModelHistoryQuery,
    create: { useMutation: useCreateVehicleModelMutation, toArg: (v) => ({ vehicleModelCreate: v }) },
    update: { useMutation: useUpdateVehicleModelMutation, toArg: (id, v) => ({ id, vehicleModelUpdate: v }) },
  },
};
