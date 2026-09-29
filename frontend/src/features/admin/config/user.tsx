import { z } from 'zod';
import { ActiveBadge } from '@/shared/components/ui';
import {
  activeFilter,
  dealershipFilter,
  type EntityViewConfig,
  muted,
  optionalId,
  optionalText,
  password,
  requiredText,
  strong,
} from '@/shared/entity';
import { formatDateTime } from '@/shared/lib';
import {
  useCreateUserMutation,
  useGetUserQuery,
  useListUsersQuery,
  type User,
  useUpdateUserMutation,
} from '../adminApi';
import { AssignableRoleSelect } from '../components/AssignableRoleSelect';
import { UserRoleAssignments } from '../components/UserRoleAssignments';
import { P } from '../permissions';

export const userView: EntityViewConfig<User> = {
  singular: 'User',
  plural: 'Users',
  basePath: '/admin/users',
  entityType: 'core.user',
  permissions: { view: [P.usersView], create: P.usersCreate, update: [P.usersUpdate] },
  list: {
    defaultSort: 'fullName',
    searchPlaceholder: 'Search name or email',
    filters: [dealershipFilter, activeFilter],
    columns: [
      { key: 'fullName', header: 'Name', sortKey: 'fullName', render: (u) => strong(u.fullName) },
      { key: 'email', header: 'Email', sortKey: 'email' },
      { key: 'roles', header: 'Roles', render: (u) => muted(u.roles.length ? [...new Set(u.roles.map((r) => r.roleName))].join(', ') : null) },
      { key: 'lastLoginAt', header: 'Last sign-in', sortKey: 'lastLoginAt', render: (u) => formatDateTime(u.lastLoginAt) },
      { key: 'isActive', header: 'Status', render: (u) => <ActiveBadge active={u.isActive} /> },
    ],
  },
  detail: {
    title: (u) => u.fullName,
    subtitle: (u) => u.email,
    fields: [
      { label: 'Email', value: (u) => u.email },
      { label: 'Phone', value: (u) => u.phone },
      { label: 'Status', value: (u) => <ActiveBadge active={u.isActive} /> },
      { label: 'Last sign-in', value: (u) => formatDateTime(u.lastLoginAt) },
      { label: 'Created', value: (u) => formatDateTime(u.createdAt) },
    ],
    sections: (u) => <UserRoleAssignments user={u} />,
  },
  // Users span tenants through their assignments; the server checks that the editor covers all of them.
  canEdit: (_u, perm) => perm.can(P.usersUpdate),
  form: {
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true, mode: 'create' },
      { name: 'email', label: 'Email (used to sign in)', type: 'email', required: true, mode: 'edit', hint: 'Tell the person: they sign in with the new email from now on' },
      { name: 'fullName', label: 'Full name', type: 'text', required: true },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'password', label: 'Password', type: 'password', required: true, mode: 'create', hint: 'At least 10 characters with a letter and a digit' },
      { name: 'password', label: 'New password', type: 'password', mode: 'edit', hint: 'Leave blank to keep the current password. Resetting signs the user out everywhere.' },
      {
        name: 'isActive',
        label: 'Active — untick when the employee leaves (signs them out and blocks sign-in)',
        type: 'boolean',
        mode: 'edit',
        span: 2,
      },
      {
        name: 'dealershipId',
        label: 'Dealership',
        type: 'dealership',
        mode: 'create',
        scopePermission: P.usersAssignRoles,
        hint: 'System administrators: leave empty for all dealerships (global)',
      },
      {
        name: 'roleId',
        label: 'Role',
        type: 'custom',
        mode: 'create',
        render: ({ id, value, onChange, invalid, values }) => (
          <AssignableRoleSelect id={id} value={value} onChange={onChange} invalid={invalid} dealershipId={Number(values.dealershipId) || null} />
        ),
      },
      { name: 'branchId', label: 'Role scope: branch', type: 'branch', mode: 'create', dealershipField: 'dealershipId', scopePermission: P.usersAssignRoles },
    ],
    createSchema: z
      .object({
        email: z.email('Enter a valid email').trim(),
        fullName: requiredText(),
        phone: optionalText(30),
        password: password(),
        roleId: optionalId(),
        dealershipId: optionalId(),
        branchId: optionalId(),
      })
      .refine((v) => !v.branchId || v.dealershipId, { message: 'Choose the dealership for this branch', path: ['dealershipId'] }),
    updateSchema: z.object({
      email: z.email('Enter a valid email').trim(),
      fullName: requiredText(),
      phone: optionalText(30),
      isActive: z.boolean(),
      password: z.union([z.literal(''), password()]).transform((v) => v || undefined),
    }),
  },
  api: {
    useList: useListUsersQuery,
    useGet: useGetUserQuery,
    create: {
      useMutation: useCreateUserMutation,
      toArg: ({ roleId, dealershipId, branchId, ...v }) => ({
        userCreate: { ...v, roles: roleId ? [{ roleId, dealershipId, branchId }] : [] },
      }),
    },
    update: { useMutation: useUpdateUserMutation, toArg: (id, v) => ({ id, userUpdate: v }) },
  },
};
