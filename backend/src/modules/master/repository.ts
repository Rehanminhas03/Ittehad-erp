import { type Access, scopeWhere } from '../../auth/access';
import { type Executor, query } from '../../db/client';
import { type SQL, and, inArray, isNull, sql } from '../../db/sql';
import { dealership } from '../core/models';
import { customer, vehicle, vehicleDealership, vehicleModel, vehicleOwnership } from './models';
import { MasterPerm } from './permissions';

export interface OwnerSummary {
  customerId: number;
  fullName: string;
  mobile: string;
  dealershipId: number;
  since: string;
}

/**
 * Vehicles are visible through their dealership links (RLS applies to the link table too).
 * Pass `vehicleIdColumn` to scope any table keyed by vehicle (e.g. a vehicle's service schedule).
 */
export function vehicleVisibility(access: Access, codes: string[], vehicleIdColumn: SQL = vehicle.id): SQL {
  const s = access.scope(...codes);
  if (s.global) return sql`true`;
  return sql`exists (select 1 from ${vehicleDealership} where ${vehicleDealership.vehicleId} = ${vehicleIdColumn} and ${scopeWhere(s, { dealership: vehicleDealership.dealershipId })})`;
}

export async function modelNames(ex: Executor, ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const rows = await ex.vehicleModel.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, brand: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, `${r.brand} ${r.name}`]));
}

/**
 * Current owner per vehicle, only from dealerships where the caller may view customers
 * (owner identity is customer personal data). Most recent ownership wins across dealerships.
 */
export async function currentOwners(ex: Executor, access: Access, vehicleIds: number[]): Promise<Map<number, OwnerSummary>> {
  if (!vehicleIds.length) return new Map();
  const rows = await query<OwnerSummary & { vehicleId: number }>(
    ex,
    sql`select ${vehicleOwnership.vehicleId} as "vehicleId", ${vehicleOwnership.customerId} as "customerId",
               ${customer.fullName} as "fullName", ${customer.mobile} as "mobile",
               ${vehicleOwnership.dealershipId} as "dealershipId", ${vehicleOwnership.startDate}::text as "since"
          from ${vehicleOwnership}
          inner join ${customer} on ${customer.id} = ${vehicleOwnership.customerId}
         where ${and(
           inArray(vehicleOwnership.vehicleId, vehicleIds),
           isNull(vehicleOwnership.endDate),
           scopeWhere(access.scope(MasterPerm.customersView), { dealership: vehicleOwnership.dealershipId }),
         )!}
         order by ${vehicleOwnership.startDate} desc, ${vehicleOwnership.id} desc`,
  );
  const out = new Map<number, OwnerSummary>();
  for (const { vehicleId, ...o } of rows) if (!out.has(vehicleId)) out.set(vehicleId, o);
  return out;
}

/** Dealerships (within the caller's vehicle scope) each vehicle is linked to. */
export async function linkedDealerships(ex: Executor, access: Access, vehicleIds: number[]) {
  if (!vehicleIds.length) return new Map<number, { id: number; name: string }[]>();
  const rows = await query<{ vehicleId: number; id: number; name: string }>(
    ex,
    sql`select ${vehicleDealership.vehicleId} as "vehicleId", ${dealership.id} as "id", ${dealership.name} as "name"
          from ${vehicleDealership}
          inner join ${dealership} on ${dealership.id} = ${vehicleDealership.dealershipId}
         where ${and(
           inArray(vehicleDealership.vehicleId, vehicleIds),
           scopeWhere(access.scope(MasterPerm.vehiclesView), { dealership: vehicleDealership.dealershipId }),
         )!}
         order by ${dealership.name}`,
  );
  const out = new Map<number, { id: number; name: string }[]>();
  for (const { vehicleId, ...d } of rows) out.set(vehicleId, [...(out.get(vehicleId) ?? []), d]);
  return out;
}

export async function isLinked(ex: Executor, vehicleId: number, dealershipId: number): Promise<boolean> {
  const row = await ex.vehicleDealership.findFirst({ where: { vehicleId, dealershipId }, select: { id: true } });
  return !!row;
}

/**
 * Group-wide lookup by any identifier. The vehicle table has no tenant column (one row per physical
 * vehicle), so this sees every vehicle; callers decide what they may reveal.
 */
export async function findVehicleByIdentifiers(
  ex: Executor,
  ids: { vin?: string | null; engineNo?: string | null; registrationNo?: string | null },
  excludeId?: number,
) {
  const conds: { vin?: string; engineNo?: string; registrationNo?: string }[] = [];
  if (ids.vin) conds.push({ vin: ids.vin });
  if (ids.engineNo) conds.push({ engineNo: ids.engineNo });
  if (ids.registrationNo) conds.push({ registrationNo: ids.registrationNo });
  if (!conds.length) return [];
  return ex.vehicle.findMany({
    where: { OR: conds, ...(excludeId ? { id: { not: excludeId } } : {}) },
    take: 5,
  });
}

/** Existing customer in the same dealership with the same mobile or CNIC. */
export async function findDuplicateCustomer(
  ex: Executor,
  dealershipId: number,
  mobileNormalized: string | null,
  cnic: string | null,
  excludeId?: number,
) {
  const conds: { mobileNormalized?: string; cnic?: string }[] = [];
  if (mobileNormalized) conds.push({ mobileNormalized });
  if (cnic) conds.push({ cnic });
  if (!conds.length) return undefined;
  const row = await ex.customer.findFirst({
    where: { dealershipId, OR: conds, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, fullName: true, mobileNormalized: true, cnic: true },
  });
  return row ?? undefined;
}
