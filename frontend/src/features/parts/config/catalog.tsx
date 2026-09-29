import { z } from 'zod';
import { ActiveBadge } from '@/shared/components/ui';
import { activeFilter, dealershipFilter, type EntityViewConfig, idField, mono, money, muted, optionalText, strong } from '@/shared/entity';
import { formatMoney } from '@/shared/lib';
import {
  type Part,
  type Supplier,
  useCreatePartMutation,
  useCreateSupplierMutation,
  useGetPartHistoryQuery,
  useGetPartQuery,
  useGetSupplierHistoryQuery,
  useGetSupplierQuery,
  useListPartsQuery,
  useListSuppliersQuery,
  useUpdatePartMutation,
  useUpdateSupplierMutation,
} from '../partsApi';
import { P, UOMS } from '../permissions';

/** Group-wide parts catalogue: part numbers, descriptions and selling prices. */
export const partView: EntityViewConfig<Part> = {
  singular: 'Part',
  plural: 'Parts catalogue',
  basePath: '/parts/catalog',
  entityType: 'parts.part',
  permissions: { view: [P.catalogView], create: P.catalogManage, update: [P.catalogManage] },
  list: {
    defaultSort: 'partNo',
    searchPlaceholder: 'Search part number or description',
    filters: [activeFilter],
    columns: [
      { key: 'partNo', header: 'Part no.', sortKey: 'partNo', render: (p) => mono(p.partNo) },
      { key: 'description', header: 'Description', sortKey: 'description', render: (p) => strong(p.description) },
      { key: 'brand', header: 'Brand', render: (p) => muted(p.brand) },
      { key: 'uom', header: 'Unit', render: (p) => UOMS.find((u) => u.value === p.uom)?.label ?? p.uom },
      { key: 'sellingPrice', header: 'Selling price', sortKey: 'sellingPrice', className: 'text-right tabular-nums', render: (p) => formatMoney(p.sellingPrice) },
      { key: 'isActive', header: 'Status', render: (p) => <ActiveBadge active={p.isActive} /> },
    ],
  },
  detail: {
    title: (p) => p.partNo,
    subtitle: (p) => p.description,
    fields: [
      { label: 'Description', value: (p) => p.description },
      { label: 'Brand', value: (p) => p.brand },
      { label: 'Category', value: (p) => p.category },
      { label: 'Unit', value: (p) => p.uom },
      { label: 'Selling price', value: (p) => formatMoney(p.sellingPrice) },
      { label: 'Status', value: (p) => <ActiveBadge active={p.isActive} /> },
    ],
  },
  form: {
    fields: [
      { name: 'partNo', label: 'Part number', type: 'text', required: true, mode: 'create', hint: 'Stored uppercase without spaces' },
      { name: 'description', label: 'Description', type: 'text', required: true, span: 2 },
      { name: 'brand', label: 'Brand', type: 'text' },
      { name: 'category', label: 'Category', type: 'text' },
      { name: 'uom', label: 'Unit', type: 'select', required: true, options: UOMS },
      { name: 'sellingPrice', label: 'Selling price (PKR)', type: 'money', required: true },
      { name: 'isActive', label: 'Active', type: 'boolean', mode: 'edit' },
    ],
    defaults: { uom: 'each' },
    createSchema: z.object({
      partNo: z.string().trim().min(2).max(60),
      description: z.string().trim().min(2).max(200),
      brand: optionalText(60),
      category: optionalText(60),
      uom: z.string(),
      sellingPrice: money('Selling price'),
    }),
    updateSchema: z.object({
      description: z.string().trim().min(2).max(200),
      brand: optionalText(60),
      category: optionalText(60),
      uom: z.string(),
      sellingPrice: money('Selling price'),
      isActive: z.boolean(),
    }),
  },
  api: {
    useList: useListPartsQuery,
    useGet: useGetPartQuery,
    useHistory: useGetPartHistoryQuery,
    create: { useMutation: useCreatePartMutation, toArg: (v) => ({ partCreate: v }) },
    update: { useMutation: useUpdatePartMutation, toArg: (id, v) => ({ id, partUpdate: v }) },
  },
};

export const supplierView: EntityViewConfig<Supplier> = {
  singular: 'Supplier',
  plural: 'Suppliers',
  basePath: '/parts/suppliers',
  entityType: 'parts.supplier',
  permissions: { view: [P.suppliersView], create: P.suppliersCreate, update: [P.suppliersUpdate] },
  scope: { dealershipKey: 'dealershipId' },
  list: {
    defaultSort: 'name',
    searchPlaceholder: 'Search name or code',
    filters: [dealershipFilter, activeFilter],
    columns: [
      { key: 'code', header: 'Code', sortKey: 'code', render: (s) => mono(s.code) },
      { key: 'name', header: 'Name', sortKey: 'name', render: (s) => strong(s.name) },
      { key: 'phone', header: 'Phone', render: (s) => muted(s.phone) },
      { key: 'paymentTermsDays', header: 'Terms', render: (s) => `${s.paymentTermsDays} days` },
      { key: 'isActive', header: 'Status', render: (s) => <ActiveBadge active={s.isActive} /> },
    ],
  },
  detail: {
    title: (s) => s.name,
    subtitle: (s) => s.code,
    fields: [
      { label: 'Phone', value: (s) => s.phone },
      { label: 'Email', value: (s) => s.email },
      { label: 'NTN', value: (s) => s.ntn },
      { label: 'Address', value: (s) => s.address },
      { label: 'Payment terms', value: (s) => `${s.paymentTermsDays} days` },
      { label: 'Status', value: (s) => <ActiveBadge active={s.isActive} /> },
    ],
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.suppliersCreate },
      { name: 'code', label: 'Code', type: 'text', required: true, mode: 'create' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'ntn', label: 'NTN', type: 'text' },
      { name: 'paymentTermsDays', label: 'Payment terms (days)', type: 'number' },
      { name: 'address', label: 'Address', type: 'textarea', span: 2 },
      { name: 'isActive', label: 'Active', type: 'boolean', mode: 'edit' },
    ],
    defaults: { paymentTermsDays: '30' },
    createSchema: z.object({
      dealershipId: idField('Dealership'),
      code: z.string().trim().toUpperCase().min(2).max(20),
      name: z.string().trim().min(2).max(120),
      phone: optionalText(30),
      email: z.union([z.literal('').transform(() => null), z.email()]),
      ntn: optionalText(30),
      paymentTermsDays: z.coerce.number().int().min(0).max(365),
      address: optionalText(300),
    }),
    updateSchema: z.object({
      name: z.string().trim().min(2).max(120),
      phone: optionalText(30),
      email: z.union([z.literal('').transform(() => null), z.email()]),
      ntn: optionalText(30),
      paymentTermsDays: z.coerce.number().int().min(0).max(365),
      address: optionalText(300),
      isActive: z.boolean(),
    }),
  },
  api: {
    useList: useListSuppliersQuery,
    useGet: useGetSupplierQuery,
    useHistory: useGetSupplierHistoryQuery,
    create: { useMutation: useCreateSupplierMutation, toArg: (v) => ({ supplierCreate: v }) },
    update: { useMutation: useUpdateSupplierMutation, toArg: (id, v) => ({ id, supplierUpdate: v }) },
  },
};
