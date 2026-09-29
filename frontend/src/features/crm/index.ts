// Public surface of the customers & vehicles feature (routes are lazy-loaded by the app router).
// Other modules reuse these instead of building their own customer/vehicle pickers.
export { CustomerField, type CustomerFieldProps } from './components/CustomerField';
export { CustomerPicker } from './components/CustomerPicker';
export { GlobalSearchBox } from './components/GlobalSearchBox';
export { VehicleField, type VehicleFieldProps } from './components/VehicleField';
export { useVehicleModelOptions } from './hooks/useVehicleModelOptions';
export { formatCnic } from './lib/format';
export { P as CrmPermissions, VEHICLE_PIPELINE, VEHICLE_STATUSES } from './permissions';
