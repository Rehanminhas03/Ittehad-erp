import { z } from 'zod';
import { formatCnic, maskCnic } from '@/features/crm';
import { HandOverLeads } from '@/features/sales';
import { ActiveBadge, Badge, Input, Section } from '@/shared/components/ui';
import {
  activeFilter,
  dealershipFilter,
  type EntityViewConfig,
  muted,
  optionalId,
  password,
  requiredText,
  strong,
} from '@/shared/entity';
import { usePermission } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import {
  useCreateUserMutation,
  useGetUserQuery,
  useListAssignableRolesQuery,
  useListUsersQuery,
  type User,
  useUpdateUserMutation,
} from '../adminApi';
import { AssignableRoleSelect } from '../components/AssignableRoleSelect';
import { ResetPassword } from '../components/ResetPassword';
import { UserRoleAssignments } from '../components/UserRoleAssignments';
import { P } from '../permissions';

/** Every staff member's phone (required): 10–15 digits, written any way. Same rule as the server. */
const staffPhone = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .max(30)
  .refine((v) => /^[+\d][\d\s()-]*$/.test(v) && /^\d{10,15}$/.test(v.replace(/\D/g, '')), 'Enter a valid phone number, e.g. 03001234567');
const employeeCode = z.string().trim().max(30).regex(/^[A-Za-z0-9/_-]*$/, 'Letters, digits, - / and _ only');
const staffCnic = z
  .string()
  .trim()
  .refine((v) => v === '' || v.replace(/\D/g, '').length === 13, 'CNIC must be 13 digits, e.g. 14301-5305891-1');

const DAY = 86_400_000;
/** Days since the last sign-in (null: never signed in). */
const daysAway = (u: User) => (u.lastLoginAt ? Math.floor((Date.now() - Date.parse(u.lastLoginAt)) / DAY) : null);
/** Last sign-in, in red when an active user has not signed in for 7+ days (or never). */
function LastSignIn({ u }: { u: User }) {
  const days = daysAway(u);
  const stale = u.isActive && (days === null || days >= 7);
  if (!stale) return <>{formatDateTime(u.lastLoginAt)}</>;
  return <Badge tone="red">{days === null ? 'Never signed in' : `${days} days ago`}</Badge>;
}

/** Role filter: the roles the signed-in manager works with. */
function useRoleOptions() {
  const perm = usePermission();
  const own = perm.dealershipsFor(P.usersAssignRoles);
  const { data } = useListAssignableRolesQuery({ dealershipId: !perm.isGlobal(P.usersAssignRoles) && own.length === 1 ? own[0]!.id : undefined });
  return (data ?? []).map((r) => ({ value: String(r.id), label: r.name }));
}

/** Where the person works and as what: "Salesperson · Hyundai Islamabad". */
const rolesText = (u: User) =>
  u.roles.length ? [...new Set(u.roles.map((r) => (r.dealershipName ? `${r.roleName} · ${r.dealershipName}` : `${r.roleName} · All dealerships`)))].join(', ') : null;

export const userView: EntityViewConfig<User> = {
  singular: 'User',
  plural: 'Users',
  basePath: '/admin/users',
  entityType: 'core.user',
  permissions: { view: [P.usersView], create: P.usersCreate, update: [P.usersUpdate] },
  list: {
    defaultSort: 'fullName',
    searchPlaceholder: 'Search name, email, phone or employee code',
    filters: [
      dealershipFilter,
      { param: 'roleId', label: 'Role', type: 'select', useOptions: useRoleOptions },
      activeFilter,
      {
        param: 'inactiveDays',
        label: 'Not signed in',
        type: 'select',
        options: [
          { value: '7', label: 'For 7+ days (or never)' },
          { value: '30', label: 'For 30+ days (or never)' },
        ],
      },
    ],
    columns: [
      { key: 'fullName', header: 'Name', sortKey: 'fullName', render: (u) => strong(u.fullName) },
      { key: 'employeeCode', header: 'Emp. code', render: (u) => muted(u.employeeCode) },
      { key: 'email', header: 'Email', sortKey: 'email' },
      { key: 'phone', header: 'Phone', render: (u) => muted(u.phone) },
      { key: 'roles', header: 'Role & dealership', render: (u) => muted(rolesText(u)) },
      { key: 'lastLoginAt', header: 'Last sign-in', sortKey: 'lastLoginAt', render: (u) => <LastSignIn u={u} /> },
      { key: 'isActive', header: 'Status', render: (u) => <ActiveBadge active={u.isActive} /> },
    ],
  },
  detail: {
    title: (u) => u.fullName,
    subtitle: (u) => u.email,
    fields: [
      { label: 'Email', value: (u) => u.email },
      { label: 'Phone', value: (u) => u.phone },
      { label: 'Employee code', value: (u) => u.employeeCode },
      { label: 'CNIC', value: (u) => (u.cnic ? formatCnic(u.cnic) : null) },
      { label: 'Status', value: (u) => <ActiveBadge active={u.isActive} /> },
      {
        label: 'Last sign-in',
        value: (u) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <LastSignIn u={u} />
            {u.mustChangePassword && <Badge tone="amber">Will choose a new password at next sign-in</Badge>}
          </span>
        ),
      },
      { label: 'Created', value: (u) => formatDateTime(u.createdAt) },
    ],
    sections: (u) => <UserSections user={u} />,
  },
  // Users span tenants through their assignments; the server checks that the editor covers all of them.
  canEdit: (_u, perm) => perm.can(P.usersUpdate),
  form: {
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true, mode: 'create' },
      { name: 'email', label: 'Email (used to sign in)', type: 'email', required: true, mode: 'edit', hint: 'Tell the person: they sign in with the new email from now on' },
      { name: 'fullName', label: 'Full name', type: 'text', required: true },
      { name: 'phone', label: 'Phone', type: 'text', required: true, placeholder: '03001234567' },
      { name: 'employeeCode', label: 'Employee code', type: 'text', placeholder: 'e.g. HYD-0042', hint: 'Optional; unique across the group' },
      {
        name: 'cnic',
        label: 'CNIC',
        type: 'custom',
        hint: 'Optional',
        render: ({ id, value, onChange, invalid }) => (
          <Input id={id} value={String(value ?? '')} onChange={(e) => onChange(maskCnic(e.target.value))} invalid={invalid} inputMode="numeric" placeholder="14301-5305891-1" />
        ),
      },
      { name: 'password', label: 'Password', type: 'password', required: true, mode: 'create', hint: 'At least 10 characters with a letter and a digit. A temporary password: they choose their own at first sign-in.' },
      { name: 'passwordConfirm', label: 'Confirm password', type: 'password', required: true, mode: 'create', hint: 'Type the same password again' },
      { name: 'password', label: 'New password', type: 'password', mode: 'edit', hint: 'Leave blank to keep the current password. Resetting signs the user out everywhere; they choose their own at next sign-in.' },
      { name: 'passwordConfirm', label: 'Confirm new password', type: 'password', mode: 'edit', hint: 'Type the new password again' },
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
      // Sales staff work for the whole dealership: only a System Admin limits a role to one branch.
      {
        name: 'branchId',
        label: 'Role scope: branch',
        type: 'branch',
        mode: 'create',
        dealershipField: 'dealershipId',
        scopePermission: P.usersAssignRoles,
        visible: (perm) => perm.isGlobal(P.usersAssignRoles),
      },
    ],
    createSchema: z
      .object({
        email: z.email('Enter a valid email').trim(),
        fullName: requiredText(),
        phone: staffPhone,
        employeeCode,
        cnic: staffCnic,
        password: password(),
        passwordConfirm: z.string(),
        roleId: optionalId(),
        dealershipId: optionalId(),
        branchId: optionalId(),
      })
      .refine((v) => v.password === v.passwordConfirm, { message: 'Passwords do not match', path: ['passwordConfirm'] })
      .refine((v) => !v.branchId || v.dealershipId, { message: 'Choose the dealership for this branch', path: ['dealershipId'] }),
    updateSchema: z
      .object({
        email: z.email('Enter a valid email').trim(),
        fullName: requiredText(),
        phone: staffPhone,
        employeeCode,
        cnic: staffCnic,
        isActive: z.boolean(),
        password: z.union([z.literal(''), password()]),
        passwordConfirm: z.string(),
      })
      .refine((v) => v.password === v.passwordConfirm, { message: 'Passwords do not match', path: ['passwordConfirm'] }),
    toFormValues: (u) => ({ ...u, cnic: u.cnic ? formatCnic(u.cnic) : '', password: '', passwordConfirm: '' }),
  },
  api: {
    useList: useListUsersQuery,
    useGet: useGetUserQuery,
    create: {
      useMutation: useCreateUserMutation,
      toArg: ({ roleId, dealershipId, branchId, passwordConfirm: _c, ...v }) => ({
        userCreate: { ...v, roles: roleId ? [{ roleId, dealershipId, branchId }] : [] },
      }),
    },
    update: {
      useMutation: useUpdateUserMutation,
      toArg: (id, { passwordConfirm: _c, password: pw, ...v }) => ({ id, userUpdate: { ...v, password: pw || undefined } }),
    },
  },
};

/** Below the details: roles, staff actions (reset password) and, for the Sales Manager, handing over leads. */
function UserSections({ user }: { user: User }) {
  const perm = usePermission();
  return (
    <>
      <UserRoleAssignments user={user} />
      {perm.can(P.usersUpdate) && (
        <Section title="Password">
          <p className="mb-3 text-sm text-slate-600">Forgotten password? Set a temporary one: they choose their own at next sign-in.</p>
          <ResetPassword userId={user.id} fullName={user.fullName} />
        </Section>
      )}
      <HandOverLeads user={user} />
    </>
  );
}
