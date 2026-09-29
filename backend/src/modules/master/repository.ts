import { type SQL, and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { type Access, scopeWhere } from '../../auth/access';
import type { Executor } from '../../db/client';
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
export function vehicleVisibility(access: Access, codes: string[], vehicleIdColumn: AnyPgColumn = vehicle.id): SQL {
  const s = access.scope(...codes);
  if (s.global) return sql`true`;
  return sql`exists (select 1 from ${vehicleDealership} where ${vehicleDealership.vehicleId} = ${vehicleIdColumn} and ${scopeWhere(s, { dealership: vehicleDealership.dealershipId })})`;
}

export async function modelNames(ex: Executor, ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const rows = await ex
    .select({ id: vehicleModel.id, brand: vehicleModel.brand, name: vehicleModel.name })
    .from(vehicleModel)
    .where(inArray(vehicleModel.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, `${r.brand} ${r.name}`]));
}

/**
 * Current owner per vehicle, only from dealerships where the caller may view customers
 * (owner identity is customer personal data). Most recent ownership wins across dealerships.
 */
export async function currentOwners(ex: Executor, access: Access, vehicleIds: number[]): Promise<Map<number, OwnerSummary>> {
  if (!vehicleIds.length) return new Map();
  const rows = await ex
    .select({
      vehicleId: vehicleOwnership.vehicleId,
      customerId: vehicleOwnership.customerId,
      fullName: customer.fullName,
      mobile: customer.mobile,
      dealershipId: vehicleOwnership.dealershipId,
      since: vehicleOwnership.startDate,
    })
    .from(vehicleOwnership)
    .innerJoin(customer, eq(customer.id, vehicleOwnership.customerId))
    .where(
      and(
        inArray(vehicleOwnership.vehicleId, vehicleIds),
        isNull(vehicleOwnership.endDate),
        scopeWhere(access.scope(MasterPerm.customersView), { dealership: vehicleOwnership.dealershipId }),
      ),
    )
    .orderBy(desc(vehicleOwnership.startDate), desc(vehicleOwnership.id));
  const out = new Map<number, OwnerSummary>();
  for (const { vehicleId, ...o } of rows) if (!out.has(vehicleId)) out.set(vehicleId, o);
  return out;
}

/** Dealerships (within the caller's vehicle scope) each vehicle is linked to. */
export async function linkedDealerships(ex: Executor, access: Access, vehicleIds: number[]) {
  if (!vehicleIds.length) return new Map<number, { id: number; name: string }[]>();
  const rows = await ex
    .select({ vehicleId: vehicleDealership.vehicleId, id: dealership.id, name: dealership.name })
    .from(vehicleDealership)
    .innerJoin(dealership, eq(dealership.id, vehicleDealership.dealershipId))
    .where(
      and(
        inArray(vehicleDealership.vehicleId, vehicleIds),
        scopeWhere(access.scope(MasterPerm.vehiclesView), { dealership: vehicleDealership.dealershipId }),
      ),
    )
    .orderBy(dealership.name);
  const out = new Map<number, { id: number; name: string }[]>();
  for (const { vehicleId, ...d } of rows) out.set(vehicleId, [...(out.get(vehicleId) ?? []), d]);
  return out;
}

export async function isLinked(ex: Executor, vehicleId: number, dealershipId: number): Promise<boolean> {
  const [row] = await ex
    .select({ id: vehicleDealership.id })
    .from(vehicleDealership)
    .where(and(eq(vehicleDealership.vehicleId, vehicleId), eq(vehicleDealership.dealershipId, dealershipId)));
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
  const conds: SQL[] = [];
  if (ids.vin) conds.push(eq(vehicle.vin, ids.vin));
  if (ids.engineNo) conds.push(eq(vehicle.engineNo, ids.engineNo));
  if (ids.registrationNo) conds.push(eq(vehicle.registrationNo, ids.registrationNo));
  if (!conds.length) return [];
  return ex
    .select()
    .from(vehicle)
    .where(and(or(...conds), excludeId ? ne(vehicle.id, excludeId) : undefined))
    .limit(5);
}

/** Existing customer in the same dealership with the same mobile or CNIC. */
export async function findDuplicateCustomer(
  ex: Executor,
  dealershipId: number,
  mobileNormalized: string | null,
  cnic: string | null,
  excludeId?: number,
) {
  const conds: SQL[] = [];
  if (mobileNormalized) conds.push(eq(customer.mobileNormalized, mobileNormalized));
  if (cnic) conds.push(eq(customer.cnic, cnic));
  if (!conds.length) return undefined;
  const [row] = await ex
    .select({ id: customer.id, fullName: customer.fullName, mobileNormalized: customer.mobileNormalized, cnic: customer.cnic })
    .from(customer)
    .where(and(eq(customer.dealershipId, dealershipId), or(...conds), excludeId ? ne(customer.id, excludeId) : undefined))
    .limit(1);
  return row;
}
