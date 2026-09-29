/** Permission codes used by the admin screens (defined server-side in core/permissions.ts). */
export const P = {
  dealershipsView: 'core.dealerships.view',
  dealershipsCreate: 'core.dealerships.create',
  dealershipsUpdate: 'core.dealerships.update',
  branchesView: 'core.branches.view',
  branchesCreate: 'core.branches.create',
  branchesUpdate: 'core.branches.update',
  entitiesView: 'core.entities.view',
  entitiesManage: 'core.entities.manage',
  usersView: 'core.users.view',
  usersCreate: 'core.users.create',
  usersUpdate: 'core.users.update',
  usersAssignRoles: 'core.users.assign_roles',
  rolesView: 'core.roles.view',
  rolesManage: 'core.roles.manage',
  auditView: 'core.audit.view',
} as const;
