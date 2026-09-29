import { sql } from 'drizzle-orm';
import type { NameSource } from '../../entity/names';
import { vehicle } from '../master/models';
import { lead, salesOrder } from './models';

export const ORDER_NO: NameSource = { table: salesOrder, id: salesOrder.id, label: salesOrder.orderNo };
/** A lead's customer (the prospect's name as captured on the lead). */
export const LEAD_NAME: NameSource = { table: lead, id: lead.id, label: lead.prospectName };
/**
 * The Dealership Manager runs the whole dealership and does not sell: left out of every sales
 * people list and report (track record, team report, salesperson filters). Their login and
 * approvals are unaffected.
 */
export const DEALERSHIP_MANAGER_ROLE = 'Dealership Manager';
export const dealershipManagersSql = (dealershipId: number) => sql`
  select ur.user_id from core.user_role ur join core.role r on r.id = ur.role_id
   where ur.dealership_id = ${dealershipId} and r.name = ${DEALERSHIP_MANAGER_ROLE}`;
/** Where the car on a sales order is (booked, in transit, received, ready for delivery…); null until a car is on it. */
export const ORDER_VEHICLE_STAGE: NameSource = {
  table: salesOrder,
  id: salesOrder.id,
  label: sql<string>`(select ${vehicle.status} from ${vehicle} where ${vehicle.id} = ${salesOrder.vehicleId})`,
};
