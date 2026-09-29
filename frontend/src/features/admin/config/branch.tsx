import { z } from 'zod';
import { ActiveBadge } from '@/shared/components/ui';
import {
  activeFilter,
  code,
  dealershipFilter,
  type EntityViewConfig,
  idField,
  mono,
  optionalText,
  requiredText,
  strong,
} from '@/shared/entity';
import {
  type Branch,
  useCreateBranchMutation,
  useGetBranchHistoryQuery,
  useGetBranchQuery,
  useListBranchesQuery,
  useUpdateBranchMutation,
} from '../adminApi';
import { P } from '../permissions';

export const branchView: EntityViewConfig<Branch> = {
  singular: 'Branch',
  plural: 'Branches',
  basePath: '/admin/branches',
  entityType: 'core.branch',
  permissions: { view: [P.branchesView], create: P.branchesCreate, update: [P.branchesUpdate] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'id' },
  list: {
    defaultSort: 'name',
    searchPlaceholder: 'Search name, code, city',
    filters: [dealershipFilter, activeFilter],
    columns: [
      { key: 'code', header: 'Code', sortKey: 'code', render: (b) => mono(b.code) },
      { key: 'name', header: 'Name', sortKey: 'name', render: (b) => strong(b.name) },
      { key: 'dealershipName', header: 'Dealership', render: (b) => b.dealershipName ?? '—' },
      { key: 'city', header: 'City', sortKey: 'city', render: (b) => b.city ?? '—' },
      { key: 'isActive', header: 'Status', render: (b) => <ActiveBadge active={b.isActive} /> },
    ],
  },
  detail: {
    title: (b) => b.name,
    subtitle: (b) => `${b.dealershipName ?? ''} · ${b.code}`,
    fields: [
      { label: 'Dealership', value: (b) => b.dealershipName },
      { label: 'Code', value: (b) => b.code },
      { label: 'City', value: (b) => b.city },
      { label: 'Phone', value: (b) => b.phone },
      { label: 'Address', value: (b) => b.address },
      { label: 'Status', value: (b) => <ActiveBadge active={b.isActive} /> },
    ],
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.branchesCreate },
      { name: 'code', label: 'Code', type: 'text', required: true, mode: 'create' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea', span: 2 },
      { name: 'isActive', label: 'Active', type: 'boolean', mode: 'edit' },
    ],
    createSchema: z.object({
      dealershipId: idField('Dealership'),
      code: code(),
      name: requiredText(),
      city: optionalText(80),
      phone: optionalText(30),
      address: optionalText(),
    }),
    updateSchema: z.object({ name: requiredText(), city: optionalText(80), phone: optionalText(30), address: optionalText(), isActive: z.boolean() }),
  },
  api: {
    useList: useListBranchesQuery,
    useGet: useGetBranchQuery,
    useHistory: useGetBranchHistoryQuery,
    create: { useMutation: useCreateBranchMutation, toArg: (v) => ({ branchCreate: v }) },
    update: { useMutation: useUpdateBranchMutation, toArg: (id, v) => ({ id, branchUpdate: v }) },
  },
};
