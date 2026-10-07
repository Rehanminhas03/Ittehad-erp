import { z } from 'zod';
import { ActiveBadge, Input } from '@/shared/components/ui';
import { activeFilter, dealershipFilter, type EntityViewConfig, idField, muted, optionalText, requiredText, strong } from '@/shared/entity';
import { formatDateTime } from '@/shared/lib';
import { CustomerVehicles } from '../components/CustomerVehicles';
import {
  type Customer,
  useCreateCustomerMutation,
  useGetCustomerHistoryQuery,
  useGetCustomerQuery,
  useListCustomersQuery,
  useUpdateCustomerMutation,
} from '../crmApi';
import { formatCnic, maskCnic } from '../lib/format';
import { P } from '../permissions';

const KIND_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
];

// Mirrors the server rules for quick feedback; the server re-validates and normalises.
const mobile = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .refine((v) => v.replace(/\D/g, '').length >= 10, 'Enter a valid mobile number, e.g. 0300-1234567');
const cnic = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{5}-?\d{7}-?\d$/.test(v), 'CNIC must be 13 digits, e.g. 35202-1234567-1')
  .transform((v) => v || null);
const email = z.union([z.literal('').transform(() => null), z.email('Enter a valid email')]);

const shared = {
  kind: z.enum(['individual', 'company']),
  fullName: requiredText(),
  mobile,
  altPhone: optionalText(30),
  email,
  cnic,
  ntn: optionalText(30),
  city: optionalText(80),
  address: optionalText(300),
  notes: optionalText(2000),
};

export const customerView: EntityViewConfig<Customer> = {
  singular: 'Customer',
  plural: 'Customers',
  basePath: '/crm/customers',
  entityType: 'master.customer',
  permissions: { view: [P.customersView], create: P.customersCreate, update: [P.customersUpdate] },
  scope: { dealershipKey: 'dealershipId' },
  list: {
    defaultSort: 'fullName',
    searchPlaceholder: 'Search name, mobile, CNIC or email',
    filters: [dealershipFilter, { param: 'kind', label: 'Type', type: 'select', options: KIND_OPTIONS }, activeFilter],
    columns: [
      { key: 'fullName', header: 'Name', sortKey: 'fullName', render: (c) => strong(c.fullName) },
      { key: 'mobile', header: 'Mobile', render: (c) => c.mobile },
      { key: 'cnic', header: 'CNIC', render: (c) => muted(c.cnic && formatCnic(c.cnic)) },
      { key: 'city', header: 'City', sortKey: 'city', render: (c) => c.city ?? '—' },
      { key: 'dealershipName', header: 'Dealership', render: (c) => muted(c.dealershipName) },
      { key: 'isActive', header: 'Status', render: (c) => <ActiveBadge active={c.isActive} /> },
    ],
  },
  detail: {
    title: (c) => c.fullName,
    subtitle: (c) => `${c.mobile} · ${c.dealershipName ?? ''}`,
    fields: [
      { label: 'Type', value: (c) => (c.kind === 'company' ? 'Company' : 'Individual') },
      { label: 'Mobile', value: (c) => c.mobile },
      { label: 'Alternate phone', value: (c) => c.altPhone },
      { label: 'Email', value: (c) => c.email },
      { label: 'CNIC', value: (c) => formatCnic(c.cnic) },
      { label: 'NTN', value: (c) => c.ntn },
      { label: 'City', value: (c) => c.city },
      { label: 'Address', value: (c) => c.address },
      { label: 'Notes', value: (c) => c.notes },
      { label: 'Status', value: (c) => <ActiveBadge active={c.isActive} /> },
      { label: 'Created', value: (c) => formatDateTime(c.createdAt) },
    ],
    sections: (c) => <CustomerVehicles customerId={c.id} />,
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.customersCreate },
      { name: 'kind', label: 'Type', type: 'select', required: true, options: KIND_OPTIONS },
      { name: 'fullName', label: 'Full name / company name', type: 'text', required: true },
      { name: 'mobile', label: 'Mobile', type: 'tel', required: true, placeholder: '03001234567', hint: 'Digits only. Used to find the customer; must be unique in the dealership' },
      { name: 'altPhone', label: 'Alternate phone', type: 'text' },
      { name: 'email', label: 'Email', type: 'email' },
      {
        name: 'cnic',
        label: 'CNIC',
        type: 'custom',
        hint: '13 digits, e.g. 14301-5305891-1',
        render: ({ id, value, onChange, invalid }) => (
          <Input id={id} inputMode="numeric" value={maskCnic(value as string | null)} onChange={(e) => onChange(maskCnic(e.target.value))} placeholder="14301-5305891-1" invalid={invalid} />
        ),
      },
      { name: 'ntn', label: 'NTN', type: 'text' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea', span: 2 },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      { name: 'isActive', label: 'Active', type: 'boolean', mode: 'edit' },
    ],
    defaults: { kind: 'individual' },
    createSchema: z.object({ dealershipId: idField('Dealership'), ...shared }),
    updateSchema: z.object({ ...shared, isActive: z.boolean() }),
  },
  api: {
    useList: useListCustomersQuery,
    useGet: useGetCustomerQuery,
    useHistory: useGetCustomerHistoryQuery,
    create: { useMutation: useCreateCustomerMutation, toArg: (v) => ({ customerCreate: v }) },
    update: { useMutation: useUpdateCustomerMutation, toArg: (id, v) => ({ id, customerUpdate: v }) },
  },
};
