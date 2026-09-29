import { definePermissions } from '../../auth/permissions';

export const MasterPerm = definePermissions('master', {
  customersView: ['master.customers.view', 'View customers'],
  customersCreate: ['master.customers.create', 'Create customers'],
  customersUpdate: ['master.customers.update', 'Edit customers'],
  vehiclesView: ['master.vehicles.view', 'View vehicles linked to your dealerships'],
  vehiclesCreate: ['master.vehicles.create', 'Register vehicles, or link a group vehicle to your dealership'],
  vehiclesUpdate: ['master.vehicles.update', 'Edit vehicle details'],
  ownershipManage: ['master.ownership.manage', 'Record vehicle ownership and transfers'],
  modelsView: ['master.models.view', 'View the vehicle model catalogue'],
  modelsManage: ['master.models.manage', 'Maintain the vehicle model catalogue (global grant required)'],
});
