import { sql } from 'drizzle-orm';
import type { NameSource } from '../../entity/names';
import { user } from '../core/models';
import { customer, vehicle, vehicleModel } from './models';

/** Display-name sources other modules use with withNames(). */
export const USER_NAME: NameSource = { table: user, id: user.id, label: user.fullName };
export const CUSTOMER_NAME: NameSource = { table: customer, id: customer.id, label: customer.fullName };
export const MODEL_NAME: NameSource = { table: vehicleModel, id: vehicleModel.id, label: sql<string>`${vehicleModel.brand} || ' ' || ${vehicleModel.name}` };
/** Plate if registered, otherwise VIN, otherwise engine number; 'Pending' before any is known. */
export const VEHICLE_LABEL: NameSource = { table: vehicle, id: vehicle.id, label: sql<string>`coalesce(${vehicle.registrationNo}, ${vehicle.vin}, ${vehicle.engineNo}, 'Pending')` };
export const VEHICLE_STATUS: NameSource = { table: vehicle, id: vehicle.id, label: vehicle.status };
