import { z } from 'zod';
import { ActiveBadge } from '@/shared/components/ui';
import { activeFilter, type EntityViewConfig, strong } from '@/shared/entity';
import { P } from '../permissions';
import {
  type InspectionTemplateItem,
  useCreateInspectionTemplateItemMutation,
  useGetInspectionTemplateItemHistoryQuery,
  useGetInspectionTemplateItemQuery,
  useListInspectionTemplateItemsQuery,
  useUpdateInspectionTemplateItemMutation,
} from '../serviceApi';

/** The multi-point checklist every new inspection starts from. */
export const inspectionTemplateView: EntityViewConfig<InspectionTemplateItem> = {
  singular: 'Checklist item',
  plural: 'Inspection checklist',
  basePath: '/service/setup/checklist',
  entityType: 'service.inspection_template_item',
  permissions: { view: [P.setupView], create: P.setupManage, update: [P.setupManage] },
  list: {
    defaultSort: 'sortOrder',
    searchPlaceholder: 'Search area or item',
    filters: [activeFilter],
    columns: [
      { key: 'area', header: 'Area', sortKey: 'area', render: (i) => strong(i.area) },
      { key: 'item', header: 'Item', sortKey: 'item' },
      { key: 'sortOrder', header: 'Order', sortKey: 'sortOrder' },
      { key: 'isActive', header: 'Status', render: (i) => <ActiveBadge active={i.isActive} /> },
    ],
  },
  detail: {
    title: (i) => `${i.area}: ${i.item}`,
    fields: [
      { label: 'Area', value: (i) => i.area },
      { label: 'Item', value: (i) => i.item },
      { label: 'Order', value: (i) => i.sortOrder },
      { label: 'Status', value: (i) => <ActiveBadge active={i.isActive} /> },
    ],
  },
  form: {
    fields: [
      { name: 'area', label: 'Area', type: 'text', required: true, placeholder: 'Brakes' },
      { name: 'item', label: 'Item', type: 'text', required: true, placeholder: 'Front brake pads' },
      { name: 'sortOrder', label: 'Order', type: 'number', hint: 'Lower numbers come first' },
      { name: 'isActive', label: 'Active', type: 'boolean', mode: 'edit' },
    ],
    defaults: { sortOrder: '100' },
    createSchema: z.object({ area: z.string().trim().min(2).max(60), item: z.string().trim().min(2).max(120), sortOrder: z.coerce.number().int().min(0).max(10000) }),
    updateSchema: z.object({
      area: z.string().trim().min(2).max(60),
      item: z.string().trim().min(2).max(120),
      sortOrder: z.coerce.number().int().min(0).max(10000),
      isActive: z.boolean(),
    }),
  },
  api: {
    useList: useListInspectionTemplateItemsQuery,
    useGet: useGetInspectionTemplateItemQuery,
    useHistory: useGetInspectionTemplateItemHistoryQuery,
    create: { useMutation: useCreateInspectionTemplateItemMutation, toArg: (v) => ({ inspectionTemplateItemCreate: v }) },
    update: { useMutation: useUpdateInspectionTemplateItemMutation, toArg: (id, v) => ({ id, inspectionTemplateItemUpdate: v }) },
  },
};
