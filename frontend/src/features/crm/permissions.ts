/** Permission codes used by the customer & vehicle screens (defined server-side in master/permissions.ts). */
export const P = {
  customersView: 'master.customers.view',
  customersCreate: 'master.customers.create',
  customersUpdate: 'master.customers.update',
  vehiclesView: 'master.vehicles.view',
  vehiclesCreate: 'master.vehicles.create',
  vehiclesUpdate: 'master.vehicles.update',
  ownershipManage: 'master.ownership.manage',
  modelsView: 'master.models.view',
  modelsManage: 'master.models.manage',
} as const;

/**
 * Vehicle stock / delivery pipeline. `available` is the resting state; a sales order allocation
 * moves it to `booked`, logistics move it on through, and completing the delivery sets `delivered`.
 * `reserved`, `transferred` and `hold` are set manually, outside that automatic chain.
 */
export const VEHICLE_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'booked', label: 'Booked' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'received', label: 'Received' },
  { value: 'ready_for_delivery', label: 'Ready for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'hold', label: 'On hold' },
];
/** The automatic, order-driven part of the pipeline (see VEHICLE_STATUSES). */
export const VEHICLE_PIPELINE = ['booked', 'in_transit', 'received', 'ready_for_delivery'] as const;
