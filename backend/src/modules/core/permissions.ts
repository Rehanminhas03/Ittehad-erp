import { definePermissions } from '../../auth/permissions';

export const CorePerm = definePermissions('core', {
  dealershipsView: ['core.dealerships.view', 'View dealerships'],
  dealershipsCreate: ['core.dealerships.create', 'Create dealerships (global grant required)'],
  dealershipsUpdate: ['core.dealerships.update', 'Edit dealership details'],
  branchesView: ['core.branches.view', 'View branches'],
  branchesCreate: ['core.branches.create', 'Create branches'],
  branchesUpdate: ['core.branches.update', 'Edit branches'],
  entitiesView: ['core.entities.view', 'View legal and accounting entities'],
  entitiesManage: ['core.entities.manage', 'Create/edit legal and accounting entities (global grant required)'],
  usersView: ['core.users.view', 'View users'],
  usersCreate: ['core.users.create', 'Create users'],
  usersUpdate: ['core.users.update', 'Edit users, reset passwords, activate/deactivate'],
  usersAssignRoles: ['core.users.assign_roles', 'Assign and revoke user roles within scope'],
  rolesView: ['core.roles.view', 'View roles and the permission catalog'],
  rolesManage: ['core.roles.manage', 'Create/edit/delete roles and their permissions (global grant required)'],
  auditView: ['core.audit.view', 'View the audit log'],
  activityViewTeam: ['core.activity.view_team', 'View the activity of everyone in your scope (sign-ins, changes); everyone always sees their own'],
});
