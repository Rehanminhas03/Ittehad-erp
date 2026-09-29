import { type Tx, query } from '../../db/client';
import { and, eq, isNull, sql } from '../../db/sql';
import { POLICIES } from '../../config/policies';
import type { EntityCtx } from '../../entity/types';
import { validationError } from '../../lib/errors';
import { customer, vehicle, vehicleOwnership } from '../master/models';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, days: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
};

type Vehicle = NonNullable<Awaited<ReturnType<Tx['vehicle']['findFirst']>>>;
type ScheduleEntry = NonNullable<Awaited<ReturnType<Tx['vehicleSchedule']['findFirst']>>>;

/** The vehicle's next scheduled service not yet done (lowest sequence). */
export async function nextScheduledService(ctx: EntityCtx, vehicleId: number): Promise<ScheduleEntry | null> {
  const e = await ctx.tx.vehicleSchedule.findFirst({
    where: { vehicleId, status: 'due' },
    orderBy: { sequence: 'asc' },
  });
  return e ?? null;
}

export const isWarrantyValid = (v: Vehicle, on = today()) => !!v.warrantyEndsOn && on <= v.warrantyEndsOn;

/** Free if the schedule says so and the car arrives within both the km and the date grace. */
export function isFreeScheduledService(entry: ScheduleEntry, odometerKm: number, on = today()): boolean {
  if (!entry.isFree) return false;
  const withinKm = odometerKm <= entry.dueKm + POLICIES.service.freeServiceGraceKm;
  const withinDate = on <= addDays(entry.dueDate, POLICIES.service.freeServiceGraceDays);
  return withinKm && withinDate;
}

export const lastKnownOdometer = (v: Vehicle) => v.lastOdometerKm ?? v.activationOdometerKm ?? null;

async function currentOwnerIn(ctx: EntityCtx, vehicleId: number, dealershipId: number) {
  const [o] = await query<{ customerId: number; fullName: string }>(
    ctx.tx,
    sql`select ${vehicleOwnership.customerId} as "customerId", ${customer.fullName} as "fullName"
        from ${vehicleOwnership}
        inner join ${customer} on ${customer.id} = ${vehicleOwnership.customerId}
        where ${and(eq(vehicleOwnership.vehicleId, vehicleId), eq(vehicleOwnership.dealershipId, dealershipId), isNull(vehicleOwnership.endDate))}
        order by ${vehicleOwnership.startDate} desc
        limit 1`,
  );
  return o ?? null;
}

/** What check-in would decide right now (read-only; shown on the check-in screen). */
export async function previewCheckIn(ctx: EntityCtx, v: Vehicle, dealershipId: number) {
  const next = await nextScheduledService(ctx, v.id);
  // A live visit at a dealership the caller can see (RLS); the unique index covers the whole group.
  const live = await ctx.tx.visit.findFirst({
    where: { vehicleId: v.id, status: { in: ['open', 'in_progress', 'ready'] } },
    select: { id: true },
  });
  return {
    visitSequence: v.serviceVisitCount + 1,
    nextScheduled: next,
    warrantyValid: isWarrantyValid(v),
    freeServiceIfScheduled: next ? isFreeScheduledService(next, lastKnownOdometer(v) ?? 0) : false,
    lastOdometerKm: lastKnownOdometer(v),
    currentOwner: await currentOwnerIn(ctx, v.id, dealershipId),
    openVisitId: live?.id ?? null,
  };
}

/**
 * Derives everything check-in decides, and reserves the vehicle's visit sequence.
 * The vehicle row is locked, so concurrent check-ins of the same car are serialised
 * (the one-live-visit-per-vehicle index then rejects the second).
 */
export async function computeCheckIn(
  ctx: EntityCtx,
  input: { vehicleId: number; dealershipId: number; customerId?: number | null; visitType: string; odometerKm: number },
) {
  await query(ctx.tx, sql`select 1 from ${vehicle} where ${eq(vehicle.id, input.vehicleId)} for update`);
  const v = await ctx.tx.vehicle.findFirst({ where: { id: input.vehicleId } });
  if (!v) throw validationError([{ in: 'body', path: 'vehicleId', message: 'Vehicle not found' }]);

  const last = lastKnownOdometer(v);
  if (last !== null && input.odometerKm < last) {
    throw validationError([{ in: 'body', path: 'odometerKm', message: `Odometer cannot be lower than the last recorded ${last} km` }]);
  }

  let customerId = input.customerId ?? null;
  if (customerId) {
    const c = await ctx.tx.customer.findFirst({ where: { id: customerId }, select: { dealershipId: true } });
    if (!c || c.dealershipId !== input.dealershipId) {
      throw validationError([{ in: 'body', path: 'customerId', message: 'Choose a customer of this dealership' }]);
    }
  } else {
    customerId = (await currentOwnerIn(ctx, v.id, input.dealershipId))?.customerId ?? null;
    if (!customerId) {
      throw validationError([{ in: 'body', path: 'customerId', message: 'No owner on record at this dealership: choose the customer' }]);
    }
  }

  const warrantyValid = isWarrantyValid(v);
  if (input.visitType === 'warranty' && !warrantyValid) {
    throw validationError([{ in: 'body', path: 'visitType', message: v.warrantyEndsOn ? `Warranty ended on ${v.warrantyEndsOn}` : 'This vehicle has no warranty on record' }]);
  }

  let serviceNumber: number | null = null;
  let scheduleEntryId: number | null = null;
  let freeService = false;
  if (input.visitType === 'scheduled') {
    const next = await nextScheduledService(ctx, v.id);
    if (!next) {
      throw validationError([
        { in: 'body', path: 'visitType', message: 'No scheduled service is pending for this vehicle; choose "Paid service" or "Repair"' },
      ]);
    }
    serviceNumber = next.sequence;
    scheduleEntryId = next.id;
    freeService = isFreeScheduledService(next, input.odometerKm);
  }

  await ctx.tx.vehicle.update({
    where: { id: v.id },
    data: { serviceVisitCount: v.serviceVisitCount + 1, lastOdometerKm: input.odometerKm },
  });

  return { customerId, warrantyValid, serviceNumber, scheduleEntryId, freeService, visitSequence: v.serviceVisitCount + 1 };
}

/** Undo the visit counter when a check-in is cancelled (no later visit can exist: one live visit per car). */
export async function releaseCheckIn(ctx: EntityCtx, vehicleId: number) {
  await query(ctx.tx, sql`select 1 from ${vehicle} where ${eq(vehicle.id, vehicleId)} for update`);
  const v = await ctx.tx.vehicle.findFirst({ where: { id: vehicleId } });
  if (v && v.serviceVisitCount > 0) {
    await ctx.tx.vehicle.update({ where: { id: vehicleId }, data: { serviceVisitCount: v.serviceVisitCount - 1 } });
  }
}
