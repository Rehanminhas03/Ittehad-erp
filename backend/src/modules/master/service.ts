import { scopeWhere } from '../../auth/access';
import { query } from '../../db/client';
import { type SQL, and, eq, ilike, inArray, not, or, sql } from '../../db/sql';
import { POLICIES } from '../../config/policies';
import { EntityService, escapeLike } from '../../entity/entityService';
import type { EntityCtx } from '../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import type { z } from '../../lib/zod';
import { dealership } from '../core/models';
import { assertActiveModel, customerEntity, vehicleEntity } from './entities';
import { customer, vehicle, vehicleModel, vehicleOwnership } from './models';
import { classifyQuery, normalizeIdentifier } from './normalize';
import { pakistanToday } from '../../lib/dates';
import { MasterPerm } from './permissions';
import { currentOwners, findVehicleByIdentifiers, isLinked, vehicleVisibility } from './repository';
import type { VehicleCreate } from './schemas';

export const customers = new EntityService(customerEntity);
export const vehicles = new EntityService(vehicleEntity);

// Pakistan calendar day (the database's), not the UTC date.
const today = () => pakistanToday();

// =============================================================================
// Vehicles: create / link (no duplicates anywhere in the group)
// =============================================================================
/** Links a vehicle to a dealership (idempotent). Server-internal: callers authorise first. */
export async function link(ctx: EntityCtx, vehicleId: number, dealershipId: number, source: 'manual' | 'sale' | 'service') {
  await ctx.tx.vehicleDealership.createMany({
    data: [{ vehicleId, dealershipId, source, createdById: ctx.access.userId }],
    skipDuplicates: true,
  });
}

export async function createVehicle(ctx: EntityCtx, input: z.output<typeof VehicleCreate>) {
  const { dealershipId, ownerCustomerId, ...data } = input;
  if (!ctx.access.canIn(MasterPerm.vehiclesCreate, { dealershipId })) throw forbidden('You cannot register vehicles in this dealership');
  await assertActiveModel(ctx, data.modelId);

  const [existing] = await findVehicleByIdentifiers(ctx.tx, data);
  if (existing) {
    const field = existing.vin === data.vin ? 'vin' : existing.engineNo && existing.engineNo === data.engineNo ? 'engineNo' : 'registrationNo';
    const linked = await isLinked(ctx.tx, existing.id, dealershipId);
    throw conflict(
      linked
        ? 'This vehicle is already registered in your dealership'
        : 'This vehicle is already registered in the group. Add it to your dealership instead of creating it again.',
      { existingId: linked ? existing.id : undefined, linked, field },
    );
  }

  const row = await ctx.tx.vehicle.create({
    data: { ...data, createdById: ctx.access.userId, updatedById: ctx.access.userId },
  });
  await link(ctx, row!.id, dealershipId, 'manual');
  await ctx.audit({ entityType: vehicleEntity.entityType, entityId: row!.id, action: 'create', dealershipId, changes: input });
  if (ownerCustomerId) await recordOwnership(ctx, row!.id, { customerId: ownerCustomerId });
  return vehicles.get(ctx, row!.id);
}

/** Adds a group vehicle to a dealership. The caller must know an exact identifier (no browsing). */
export async function linkVehicle(ctx: EntityCtx, dealershipId: number, identifier: string) {
  if (!ctx.access.canIn(MasterPerm.vehiclesCreate, { dealershipId })) throw forbidden('You cannot add vehicles to this dealership');
  const id = normalizeIdentifier(identifier);
  const [v] = await findVehicleByIdentifiers(ctx.tx, { vin: id, engineNo: id, registrationNo: id });
  if (!v) throw notFound('Vehicle');
  if (!(await isLinked(ctx.tx, v.id, dealershipId))) {
    await link(ctx, v.id, dealershipId, 'manual');
    await ctx.audit({ entityType: vehicleEntity.entityType, entityId: v.id, action: 'link', dealershipId, changes: { identifier: id } });
  }
  return vehicles.get(ctx, v.id);
}

/**
 * Marks a new vehicle as in service (called by Sales on delivery). Server-internal: the caller
 * has already authorised the delivery. A vehicle is activated only once.
 */
export async function activateVehicle(
  ctx: EntityCtx,
  vehicleId: number,
  input: { dealershipId: number; activatedOn: string; odometerKm: number },
) {
  await query(ctx.tx, sql`select 1 from ${vehicle} where ${vehicle.id} = ${vehicleId} for update`);
  const v = await ctx.tx.vehicle.findFirst({ where: { id: vehicleId } });
  if (!v) throw notFound('Vehicle');
  if (v.activatedOn) throw conflict(`This vehicle was already delivered on ${v.activatedOn}`);
  const end = new Date(`${input.activatedOn}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + POLICIES.vehicle.warrantyMonths);
  const warrantyEndsOn = end.toISOString().slice(0, 10);
  await ctx.tx.vehicle.update({
    where: { id: vehicleId },
    data: {
      activatedOn: input.activatedOn,
      warrantyEndsOn,
      activationOdometerKm: input.odometerKm,
      soldByDealershipId: input.dealershipId,
      status: 'delivered',
      updatedById: ctx.access.userId,
    },
  });
  await link(ctx, vehicleId, input.dealershipId, 'sale');
  await ctx.audit({
    entityType: vehicleEntity.entityType,
    entityId: vehicleId,
    action: 'activate',
    dealershipId: input.dealershipId,
    changes: { activatedOn: input.activatedOn, warrantyEndsOn, activationOdometerKm: input.odometerKm },
  });
  return { ...v, activatedOn: input.activatedOn, warrantyEndsOn };
}

// =============================================================================
// Ownership
// =============================================================================
export async function recordOwnership(ctx: EntityCtx, vehicleId: number, input: { customerId: number; startDate?: string }) {
  await vehicles.findVisible(ctx, vehicleId);
  const c = await customers.findVisible(ctx, input.customerId);
  const dealershipId = c.dealershipId as number;
  if (!ctx.access.canIn(MasterPerm.ownershipManage, { dealershipId })) throw forbidden('You cannot record ownership in this dealership');
  return setOwner(ctx, vehicleId, c.id, dealershipId, input.startDate ?? today());
}

/**
 * Makes `customerId` the current owner in `dealershipId`, closing the previous ownership.
 * Server-internal (no permission check): callers authorise first, e.g. recordOwnership() above,
 * or Sales when a delivery is completed.
 */
export async function setOwner(ctx: EntityCtx, vehicleId: number, customerId: number, dealershipId: number, startDate: string) {
  const c = { id: customerId };
  if (startDate > today()) throw validationError([{ in: 'body', path: 'startDate', message: 'Ownership cannot start in the future' }]);

  // Serialise concurrent transfers of the same vehicle in this dealership.
  await query(
    ctx.tx,
    sql`select 1 from ${vehicleOwnership}
         where ${vehicleOwnership.vehicleId} = ${vehicleId} and ${vehicleOwnership.dealershipId} = ${dealershipId}
           and ${vehicleOwnership.endDate} is null
           for update`,
  );
  const open = await ctx.tx.vehicleOwnership.findFirst({ where: { vehicleId, dealershipId, endDate: null } });
  if (open?.customerId === c.id) throw conflict('This customer is already the current owner');
  if (open && startDate < open.startDate) {
    throw validationError([{ in: 'body', path: 'startDate', message: `Must be on or after the current ownership start (${open.startDate})` }]);
  }

  await link(ctx, vehicleId, dealershipId, 'manual');
  if (open) {
    await ctx.tx.vehicleOwnership.update({
      where: { id: open.id },
      data: { endDate: startDate, endedAt: new Date(), endedById: ctx.access.userId },
    });
  }
  const row = await ctx.tx.vehicleOwnership.create({
    data: { dealershipId, vehicleId, customerId: c.id, startDate, createdById: ctx.access.userId },
  });
  await ctx.audit({
    entityType: vehicleEntity.entityType,
    entityId: vehicleId,
    action: open ? 'ownership.transfer' : 'ownership.start',
    dealershipId,
    changes: { customerId: { from: open?.customerId ?? null, to: c.id }, startDate },
  });
  return row!;
}

/** Ownership history of a vehicle, limited to dealerships where the caller may view customers. */
export async function listOwnerships(ctx: EntityCtx, vehicleId: number) {
  await vehicles.findVisible(ctx, vehicleId);
  return query<{
    id: number; dealershipId: number; vehicleId: number; customerId: number;
    customerName: string; customerMobile: string; startDate: string; endDate: string | null;
  }>(
    ctx.tx,
    sql`select ${vehicleOwnership.id} as "id", ${vehicleOwnership.dealershipId} as "dealershipId",
               ${vehicleOwnership.vehicleId} as "vehicleId", ${vehicleOwnership.customerId} as "customerId",
               ${customer.fullName} as "customerName", ${customer.mobile} as "customerMobile",
               ${vehicleOwnership.startDate}::text as "startDate", ${vehicleOwnership.endDate}::text as "endDate"
          from ${vehicleOwnership}
          inner join ${customer} on ${customer.id} = ${vehicleOwnership.customerId}
         where ${and(
           eq(vehicleOwnership.vehicleId, vehicleId),
           scopeWhere(ctx.access.scope(MasterPerm.customersView), { dealership: vehicleOwnership.dealershipId }),
         )!}
         order by ${vehicleOwnership.startDate} desc, ${vehicleOwnership.id} desc
         limit 100`,
  );
}

/** Vehicles a customer owns or owned (bounded: one customer's history). */
export async function customerVehicles(ctx: EntityCtx, customerId: number) {
  await customers.findVisible(ctx, customerId);
  return query<{ vehicleId: number; vin: string | null; registrationNo: string | null; modelName: string; startDate: string; endDate: string | null }>(
    ctx.tx,
    sql`select ${vehicle.id} as "vehicleId", ${vehicle.vin} as "vin", ${vehicle.registrationNo} as "registrationNo",
               ${vehicleModel.brand} || ' ' || ${vehicleModel.name} as "modelName",
               ${vehicleOwnership.startDate}::text as "startDate", ${vehicleOwnership.endDate}::text as "endDate"
          from ${vehicleOwnership}
          inner join ${vehicle} on ${vehicle.id} = ${vehicleOwnership.vehicleId}
          inner join ${vehicleModel} on ${vehicleModel.id} = ${vehicle.modelId}
         where ${vehicleOwnership.customerId} = ${customerId}
         order by ${vehicleOwnership.endDate} is not null, ${vehicleOwnership.startDate} desc
         limit 100`,
  );
}

// =============================================================================
// Unified search: VIN / registration / engine / mobile / CNIC / name in one box
// =============================================================================
const SEARCH_LIMIT = 10;

export async function search(ctx: EntityCtx, q: string) {
  const { access, tx } = ctx;
  const { mobile, cnic, identifier } = classifyQuery(q);
  const text = `%${escapeLike(q.trim())}%`;
  const idLike = identifier.length >= 3 ? `%${escapeLike(identifier)}%` : null;
  const phoneDigits = q.replace(/\D/g, '');
  const phoneLike = phoneDigits.length >= 4 ? `%${escapeLike(phoneDigits.replace(/^0/, ''))}%` : null;

  // ---- customers (dealership-scoped) ----
  let customerHits: {
    id: number; fullName: string; mobile: string; cnic: string | null; dealershipId: number; dealershipName: string; exact: boolean;
  }[] = [];
  const matchingCustomer: SQL[] = [ilike(customer.fullName, text)];
  if (mobile) matchingCustomer.push(eq(customer.mobileNormalized, mobile));
  if (cnic) matchingCustomer.push(eq(customer.cnic, cnic));
  if (phoneLike) matchingCustomer.push(ilike(customer.mobileNormalized, phoneLike));
  const exactCustomer = or(mobile ? eq(customer.mobileNormalized, mobile) : sql`false`, cnic ? eq(customer.cnic, cnic) : sql`false`)!;

  if (access.has(MasterPerm.customersView)) {
    customerHits = await query<(typeof customerHits)[number]>(
      tx,
      sql`select ${customer.id} as "id", ${customer.fullName} as "fullName", ${customer.mobile} as "mobile",
                 ${customer.cnic} as "cnic", ${customer.dealershipId} as "dealershipId", ${dealership.name} as "dealershipName",
                 coalesce(${exactCustomer}, false) as "exact"
            from ${customer}
            inner join ${dealership} on ${dealership.id} = ${customer.dealershipId}
           where ${and(customers.viewCondition(access), or(...matchingCustomer))!}
           order by coalesce(${exactCustomer}, false) desc, ${customer.fullName} asc
           limit ${SEARCH_LIMIT}`,
    );
  }

  // ---- vehicles (visible through dealership links) ----
  let vehicleHits: {
    id: number; vin: string | null; registrationNo: string | null; engineNo: string | null; modelName: string; modelYear: number | null; exact: boolean;
    currentOwner: Awaited<ReturnType<typeof currentOwners>> extends Map<number, infer O> ? O | null : never;
  }[] = [];
  const exactVehicle = identifier.length >= 3
    ? or(eq(vehicle.vin, identifier), eq(vehicle.engineNo, identifier), eq(vehicle.registrationNo, identifier))!
    : sql`false`;
  if (access.has(MasterPerm.vehiclesView)) {
    const vehicleMatch: SQL[] = [];
    if (idLike) vehicleMatch.push(ilike(vehicle.vin, idLike), ilike(vehicle.registrationNo, idLike), ilike(vehicle.engineNo, idLike));
    // Vehicles currently owned by a matching customer the caller may see.
    if (customerHits.length) {
      vehicleMatch.push(
        sql`exists (select 1 from ${vehicleOwnership} where ${vehicleOwnership.vehicleId} = ${vehicle.id} and ${vehicleOwnership.endDate} is null and ${inArray(vehicleOwnership.customerId, customerHits.map((c) => c.id))})`,
      );
    }
    if (vehicleMatch.length) {
      const rows = await query<Omit<(typeof vehicleHits)[number], 'currentOwner'>>(
        tx,
        sql`select ${vehicle.id} as "id", ${vehicle.vin} as "vin", ${vehicle.registrationNo} as "registrationNo",
                   ${vehicle.engineNo} as "engineNo", ${vehicleModel.brand} || ' ' || ${vehicleModel.name} as "modelName",
                   ${vehicle.modelYear} as "modelYear", coalesce(${exactVehicle}, false) as "exact"
              from ${vehicle}
              inner join ${vehicleModel} on ${vehicleModel.id} = ${vehicle.modelId}
             where ${and(vehicleVisibility(access, [MasterPerm.vehiclesView]), or(...vehicleMatch))!}
             order by coalesce(${exactVehicle}, false) desc, ${vehicle.id} desc
             limit ${SEARCH_LIMIT}`,
      );
      const owners = await currentOwners(tx, access, rows.map((r) => r.id));
      vehicleHits = rows.map((r) => ({ ...r, currentOwner: owners.get(r.id) ?? null }));
    }
  }

  // ---- exact matches elsewhere in the group (only offered to users who can link vehicles) ----
  let groupMatches: { vin: string | null; registrationNo: string | null; modelName: string; matchedOn: 'vin' | 'engineNo' | 'registrationNo' }[] = [];
  if (identifier.length >= 5 && access.has(MasterPerm.vehiclesCreate)) {
    const rows = await query<{ vin: string | null; engineNo: string | null; registrationNo: string | null; modelName: string }>(
      tx,
      sql`select ${vehicle.vin} as "vin", ${vehicle.engineNo} as "engineNo", ${vehicle.registrationNo} as "registrationNo",
                 ${vehicleModel.brand} || ' ' || ${vehicleModel.name} as "modelName"
            from ${vehicle}
            inner join ${vehicleModel} on ${vehicleModel.id} = ${vehicle.modelId}
           where ${and(exactVehicle, not(vehicleVisibility(access, [MasterPerm.vehiclesView])))!}
           limit 3`,
    );
    groupMatches = rows.map(({ engineNo, ...r }) => ({
      ...r,
      matchedOn: r.vin === identifier ? 'vin' : engineNo === identifier ? 'engineNo' : 'registrationNo',
    }));
  }

  return { vehicles: vehicleHits, customers: customerHits, groupMatches };
}
