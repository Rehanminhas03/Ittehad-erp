import { sql } from '../../db/sql';
import type { NameSource } from '../../entity/names';
import { user } from '../core/models';
import { customer, vehicle, vehicleModel } from './models';

/** Display-name sources other modules use with withNames(). */
export const USER_NAME: NameSource = { table: user, id: user.id, label: user.fullName };
export const CUSTOMER_NAME: NameSource = { table: customer, id: customer.id, label: customer.fullName };
/** The customer's address (captured when the lead is converted). */
export const CUSTOMER_OCCUPATION: NameSource = { table: customer, id: customer.id, label: customer.occupation };
/** The customer's CNIC as shown on the order and the lead: the 13 digits, without hyphens. */
export const CUSTOMER_CNIC: NameSource = { table: customer, id: customer.id, label: customer.cnic };
export const CUSTOMER_FILER_STATUS: NameSource = { table: customer, id: customer.id, label: customer.filerStatus };
export const CUSTOMER_ADDRESS: NameSource = { table: customer, id: customer.id, label: customer.address };
export const MODEL_NAME: NameSource = { table: vehicleModel, id: vehicleModel.id, label: sql`${vehicleModel.brand} || ' ' || ${vehicleModel.name}` };
/** Plate if registered, otherwise VIN, otherwise engine number; 'Pending' before any is known. */
export const VEHICLE_LABEL: NameSource = { table: vehicle, id: vehicle.id, label: sql`coalesce(${vehicle.registrationNo}, ${vehicle.vin}, ${vehicle.engineNo}, 'Pending')` };
export const VEHICLE_STATUS: NameSource = { table: vehicle, id: vehicle.id, label: vehicle.status };
