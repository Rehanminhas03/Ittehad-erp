import { z } from 'zod';
import { ActiveBadge } from '@/shared/components/ui';
import { activeFilter, code, type EntityViewConfig, mono, optionalText, requiredText, strong } from '@/shared/entity';
import { formatDateTime } from '@/shared/lib';
import {
  type Dealership,
  useCreateDealershipMutation,
  useGetDealershipHistoryQuery,
  useGetDealershipQuery,
  useListDealershipsQuery,
  useUpdateDealershipMutation,
} from '../adminApi';
import { DealershipBranches } from '../components/DealershipBranches';
import { P } from '../permissions';

export const dealershipView: EntityViewConfig<Dealership> = {
  singular: 'Dealership',
  plural: 'Dealerships',
  basePath: '/admin/dealerships',
  entityType: 'core.dealership',
  permissions: { view: [P.dealershipsView], create: P.dealershipsCreate, update: [P.dealershipsUpdate] },
  scope: { dealershipKey: 'id' },
  list: {
    defaultSort: 'name',
    searchPlaceholder: 'Search name, code, brand, city',
    filters: [activeFilter],
    columns: [
      { key: 'code', header: 'Code', sortKey: 'code', render: (d) => mono(d.code) },
      { key: 'name', header: 'Name', sortKey: 'name', render: (d) => strong(d.name) },
      { key: 'brand', header: 'Brand', sortKey: 'brand' },
      { key: 'city', header: 'City', render: (d) => d.city ?? '—' },
      { key: 'isActive', header: 'Status', render: (d) => <ActiveBadge active={d.isActive} /> },
    ],
  },
  detail: {
    title: (d) => d.name,
    subtitle: (d) => `${d.brand} · ${d.code}`,
    fields: [
      { label: 'Code', value: (d) => d.code },
      { label: 'Brand', value: (d) => d.brand },
      { label: 'City', value: (d) => d.city },
      { label: 'Phone', value: (d) => d.phone },
      { label: 'Address', value: (d) => d.address },
      { label: 'Status', value: (d) => <ActiveBadge active={d.isActive} /> },
      { label: 'Created', value: (d) => formatDateTime(d.createdAt) },
    ],
    sections: (d) => <DealershipBranches dealershipId={d.id} />,
  },
  form: {
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true, mode: 'create', hint: 'Short unique code, e.g. HYD-ISB' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'brand', label: 'Brand', type: 'text', required: true },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea', span: 2 },
      { name: 'isActive', label: 'Active', type: 'boolean', mode: 'edit' },
    ],
    createSchema: z.object({
      code: code(),
      name: requiredText(),
      brand: requiredText(2, 60),
      city: optionalText(80),
      phone: optionalText(30),
      address: optionalText(),
    }),
    updateSchema: z.object({
      name: requiredText(),
      brand: requiredText(2, 60),
      city: optionalText(80),
      phone: optionalText(30),
      address: optionalText(),
      isActive: z.boolean(),
    }),
  },
  api: {
    useList: useListDealershipsQuery,
    useGet: useGetDealershipQuery,
    useHistory: useGetDealershipHistoryQuery,
    create: { useMutation: useCreateDealershipMutation, toArg: (v) => ({ dealershipCreate: v }) },
    update: { useMutation: useUpdateDealershipMutation, toArg: (id, v) => ({ id, dealershipUpdate: v }) },
  },
};
