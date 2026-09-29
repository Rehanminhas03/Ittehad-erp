import { z } from 'zod';
import { Badge } from '@/shared/components/ui';
import { type EntityViewConfig, muted, optionalText, requiredText, strong } from '@/shared/entity';
import { formatDateTime } from '@/shared/lib';
import {
  type Role,
  useCreateRoleMutation,
  useGetRoleHistoryQuery,
  useGetRoleQuery,
  useListRolesQuery,
  useUpdateRoleMutation,
} from '../adminApi';
import { RolePermissionMatrix } from '../components/RolePermissionMatrix';
import { P } from '../permissions';

export const roleView: EntityViewConfig<Role> = {
  singular: 'Role',
  plural: 'Roles',
  basePath: '/admin/roles',
  entityType: 'core.role',
  permissions: { view: [P.rolesView], create: P.rolesManage, update: [P.rolesManage] },
  list: {
    defaultSort: 'name',
    columns: [
      { key: 'name', header: 'Name', sortKey: 'name', render: (r) => strong(r.name) },
      { key: 'description', header: 'Description', render: (r) => muted(r.description) },
      { key: 'isSystem', header: 'Type', render: (r) => (r.isSystem ? <Badge tone="blue">Built-in</Badge> : <Badge>Custom</Badge>) },
    ],
  },
  detail: {
    title: (r) => r.name,
    subtitle: (r) => r.description,
    fields: [
      { label: 'Type', value: (r) => (r.isSystem ? 'Built-in (cannot be deleted)' : 'Custom') },
      { label: 'Updated', value: (r) => formatDateTime(r.updatedAt) },
    ],
    sections: (r) => <RolePermissionMatrix roleId={r.id} />,
  },
  form: {
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({ name: requiredText(), description: optionalText(500) }),
  },
  api: {
    useList: useListRolesQuery,
    useGet: useGetRoleQuery,
    useHistory: useGetRoleHistoryQuery,
    create: { useMutation: useCreateRoleMutation, toArg: (v) => ({ roleCreate: v }) },
    update: { useMutation: useUpdateRoleMutation, toArg: (id, v) => ({ id, roleUpdate: v }) },
  },
};
