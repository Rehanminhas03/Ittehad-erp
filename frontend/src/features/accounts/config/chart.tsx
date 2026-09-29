import { z } from 'zod';
import { ActiveBadge } from '@/shared/components/ui';
import { activeFilter, dealershipFilter, type EntityViewConfig, idField, mono, muted, requiredText, strong } from '@/shared/entity';
import { humanize } from '@/shared/lib';
import {
  type Account,
  useCreateAccountMutation,
  useGetAccountHistoryQuery,
  useGetAccountQuery,
  useListAccountsQuery,
  useUpdateAccountMutation,
} from '../accountsApi';
import { AccountLedger } from '../components/AccountLedger';
import { ACCOUNT_TYPES, labelOf, P } from '../permissions';

/**
 * Chart of accounts, per dealership. The standard accounts are created automatically; those with
 * a posting role receive the automatic postings (sales, receipts, stock...) and stay active.
 */
export const accountView: EntityViewConfig<Account> = {
  singular: 'Account',
  plural: 'Chart of accounts',
  basePath: '/accounts/chart',
  entityType: 'accounts.account',
  permissions: { view: [P.chartView], create: P.chartManage, update: [P.chartManage] },
  scope: { dealershipKey: 'dealershipId' },
  list: {
    defaultSort: 'code',
    searchPlaceholder: 'Search code or name',
    filters: [dealershipFilter, { param: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES }, activeFilter],
    columns: [
      { key: 'code', header: 'Code', sortKey: 'code', render: (a) => mono(a.code) },
      { key: 'name', header: 'Account', sortKey: 'name', render: (a) => strong(a.name) },
      { key: 'type', header: 'Type', sortKey: 'type', render: (a) => labelOf(ACCOUNT_TYPES, a.type) },
      { key: 'role', header: 'Automatic postings', render: (a) => muted(a.role ? humanize(a.role) : null) },
      { key: 'isActive', header: 'Status', render: (a) => <ActiveBadge active={a.isActive} /> },
    ],
  },
  detail: {
    title: (a) => `${a.code} ${a.name}`,
    subtitle: (a) => labelOf(ACCOUNT_TYPES, a.type),
    fields: [
      { label: 'Code', value: (a) => a.code },
      { label: 'Type', value: (a) => labelOf(ACCOUNT_TYPES, a.type) },
      { label: 'Automatic postings', value: (a) => (a.role ? humanize(a.role) : 'None (manual journals only)') },
      { label: 'Status', value: (a) => <ActiveBadge active={a.isActive} /> },
    ],
    sections: (a) => <AccountLedger account={a} />,
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.chartManage },
      { name: 'code', label: 'Code', type: 'text', required: true, mode: 'create', hint: 'e.g. 6100' },
      { name: 'type', label: 'Type', type: 'select', required: true, mode: 'create', options: ACCOUNT_TYPES },
      { name: 'name', label: 'Name', type: 'text', required: true, span: 2 },
      { name: 'isActive', label: 'Active', type: 'boolean', mode: 'edit' },
    ],
    createSchema: z.object({
      dealershipId: idField('Dealership'),
      code: z.string().trim().toUpperCase().regex(/^[0-9A-Z-]{2,12}$/, '2–12 digits, capitals or -'),
      type: z.enum(['asset', 'liability', 'equity', 'income', 'expense'], { message: 'Choose a type' }),
      name: requiredText(2, 120),
    }),
    updateSchema: z.object({ name: requiredText(2, 120), isActive: z.boolean() }),
  },
  api: {
    useList: useListAccountsQuery,
    useGet: useGetAccountQuery,
    useHistory: useGetAccountHistoryQuery,
    create: { useMutation: useCreateAccountMutation, toArg: (v) => ({ accountCreate: v }) },
    update: { useMutation: useUpdateAccountMutation, toArg: (id, v) => ({ id, accountUpdate: v }) },
  },
};
