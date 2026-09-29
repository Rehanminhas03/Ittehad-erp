/**
 * Sales orders (Admin): raised from a converted lead as PBO / CBO. The vehicle is allocated by
 * entering its chassis / engine number on the order, allocating free stock, or registering the
 * arriving car for the order in Open stock; until then it stays "pending".
 */
import { query } from '../../../db/client';
import { and, eq, isNull, sql } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { vehicle, vehicleDealership, VEHICLE_STATUSES } from '../../master/models';
import { findVehicleByIdentifiers } from '../../master/repository';
import { leads, orders, salesOrderEntity } from '../entities';
import { salesOrder, VEHICLE_PIPELINE } from '../models';
import { SalesPerm as P } from '../permissions';
import type { AdvanceVehicleStatusBody, OrderVehicleBody, RaiseOrderBody } from '../schemas';

// ---- Raise the order from a converted lead ----------------------------------------------
export async function raiseOrder(ctx: EntityCtx, leadId: number, input: z.output<typeof RaiseOrderBody>) {
  const l = await leads.findVisible(ctx, leadId, { lock: true });
  const dealershipId = l.dealershipId as number;
  const branchId = input.branchId ?? ((l.branchId as number | null) ?? null);
  if (!ctx.access.canIn(P.ordersCreate, { dealershipId, branchId })) throw forbidden();
  if (l.status !== 'converted') {
    throw conflict(l.status === 'processing' ? 'A sales order is already raised for this lead' : 'Only converted leads can be ordered');
  }

  const order = await orders.create(ctx, {
    dealershipId,
    branchId,
    customerId: l.customerId,
    modelId: l.interestedModelId,
    variant: l.variant ?? null,
    color: l.preferredColor ?? null,
    orderType: input.orderType,
    unitPrice: input.unitPrice,
    discount: input.discount,
    bookingAmount: input.bookingAmount ?? (l.paymentAmount as string | null) ?? '0',
    paymentReference: input.paymentReference ?? (l.paymentInstrumentRef as string | null),
    expectedDeliveryDate: input.expectedDeliveryDate ?? null,
    notes: input.notes ?? null,
    // The order is credited to the salesperson who owns the lead.
    salespersonId: l.ownerId,
  });
  await ctx.tx.salesOrder.update({ where: { id: order.id as number }, data: { leadId } });
  await ctx.tx.lead.update({ where: { id: leadId }, data: { salesOrderId: order.id as number } });
  await leads.transition(ctx, leadId, 'raise_order', `Sales order ${order.orderNo as string}`, { system: true });
  return orders.get(ctx, order.id);
}

// ---- Vehicle identifiers on the order ----------------------------------------------------
/**
 * Records the chassis / engine / registration of the vehicle for this order (the Admin, or the
 * Delivery Team once the vehicle is in stock). Updates the linked vehicle, or links an existing
 * undelivered vehicle of this dealership with those identifiers, or creates it. The car must end up
 * with both its chassis and engine number (typed now, or already on the car).
 */
export async function setOrderVehicle(ctx: EntityCtx, orderId: number, input: z.output<typeof OrderVehicleBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!orders.canOnRow(ctx.access, o, P.ordersUpdate) && !orders.canOnRow(ctx.access, o, P.ordersAllocate)) throw forbidden();
  if (o.status === 'delivered' || o.status === 'cancelled') throw conflict(`The order is ${o.status as string}`);
  const dealershipId = o.dealershipId as number;
  const ids = { vin: input.vin ?? null, engineNo: input.engineNo ?? null, registrationNo: input.registrationNo ?? null };
  const patch = Object.fromEntries(
    Object.entries({ ...ids, color: input.color, modelYear: input.modelYear }).filter(([, v]) => v !== undefined && v !== null),
  );
  if (!Object.keys(patch).length) {
    throw validationError([{ in: 'body', path: 'vin', message: 'Enter the chassis or engine number' }]);
  }

  let vehicleId = (o.vehicleId as number | null) ?? null;
  const clashes = await findVehicleByIdentifiers(ctx.tx, ids, vehicleId ?? undefined);
  // An existing car these numbers point to (e.g. stock already registered), when the order has none.
  const matched = !vehicleId && clashes.length === 1 ? clashes[0]! : null;
  // The car on an order needs both its chassis and engine number (given now, or already on the car).
  const current = vehicleId ? await ctx.tx.vehicle.findFirst({ where: { id: vehicleId }, select: { vin: true, engineNo: true } }) : null;
  const known = current ?? matched;
  const missing = [
    !(ids.vin ?? known?.vin) && { in: 'body' as const, path: 'vin', message: 'Enter the chassis number' },
    !(ids.engineNo ?? known?.engineNo) && { in: 'body' as const, path: 'engineNo', message: 'Enter the engine number' },
  ].filter((x) => !!x);
  if (missing.length) throw validationError(missing);
  if (vehicleId) {
    if (clashes.length) throw conflict('Another vehicle already has this chassis, engine or registration number');
    const v = await ctx.tx.vehicle.findFirst({ where: { id: vehicleId }, select: { activatedOn: true } });
    if (v?.activatedOn) throw conflict('The vehicle has been delivered; its identifiers can no longer be changed here');
    await ctx.tx.vehicle.updateMany({ where: { id: vehicleId }, data: { ...patch, updatedById: ctx.access.userId } });
  } else if (clashes.length) {
    // An existing vehicle (e.g. received stock): link it if it is free and of the ordered model.
    if (clashes.length > 1) throw conflict('These identifiers belong to different vehicles');
    const v = clashes[0]!;
    if (v.modelId !== o.modelId) throw conflict('That vehicle is a different model from the order');
    if (v.activatedOn) throw conflict('That vehicle has already been delivered');
    // Typed numbers must be that car's own (one number matching must not overwrite the other).
    if ((ids.vin && v.vin && ids.vin !== v.vin) || (ids.engineNo && v.engineNo && ids.engineNo !== v.engineNo)) {
      throw conflict('The chassis and engine numbers do not belong to the same car');
    }
    // Only a car of this dealership (never another dealership's stock).
    const here = await ctx.tx.vehicleDealership.findFirst({ where: { vehicleId: v.id, dealershipId }, select: { vehicleId: true } });
    if (!here) throw conflict('That vehicle is registered at another dealership');
    const taken = await ctx.tx.salesOrder.findFirst({ where: { vehicleId: v.id, status: { not: 'cancelled' } }, select: { id: true } });
    if (taken) throw conflict('That vehicle is already on another sales order');
    vehicleId = v.id;
    await ctx.tx.vehicle.updateMany({ where: { id: vehicleId }, data: { ...patch, status: 'booked', updatedById: ctx.access.userId } });
  } else {
    if (!ids.vin && !ids.engineNo) throw validationError([{ in: 'body', path: 'vin', message: 'Enter the chassis or engine number' }]);
    const v = await ctx.tx.vehicle.create({
      data: {
        ...ids,
        modelId: o.modelId as number,
        variant: (o.variant as string | null) ?? null,
        color: input.color ?? ((o.color as string | null) ?? null),
        modelYear: input.modelYear ?? null,
        status: 'booked',
        createdById: ctx.access.userId,
        updatedById: ctx.access.userId,
      },
      select: { id: true },
    });
    vehicleId = v.id;
  }
  await ctx.tx.vehicleDealership.createMany({
    data: [{ vehicleId, dealershipId, source: 'sale', createdById: ctx.access.userId }],
    skipDuplicates: true,
  });
  if (vehicleId !== o.vehicleId) {
    await ctx.tx.salesOrder.update({ where: { id: orderId }, data: { vehicleId, updatedById: ctx.access.userId } });
  }
  await ctx.audit({
    entityType: salesOrderEntity.entityType,
    entityId: orderId,
    action: 'vehicle.set',
    dealershipId,
    branchId: (o.branchId as number | null) ?? null,
    changes: { vehicleId, ...patch },
  });
  return orders.get(ctx, orderId);
}

// ---- Stock allocation & logistics (Delivery Team) ---------------------------------------------
/**
 * Orders the Delivery Team works: from booking (the Admin raised it) until delivery. The car can be
 * allocated and tracked before the Manager approves; the handover (delivery) still needs approval.
 */
export const LIVE_ORDER_STATES = ['draft', 'submitted', 'approved'] as const;
const isLive = (status: unknown) => (LIVE_ORDER_STATES as readonly string[]).includes(status as string);

/** New (never delivered) stock of the order's model at its dealership, not on another live order. */
export async function allocatableVehicles(ctx: EntityCtx, orderId: number) {
  const o = await orders.findVisible(ctx, orderId);
  return query<{
    id: number;
    vin: string | null;
    engineNo: string | null;
    registrationNo: string | null;
    variant: string | null;
    color: string | null;
    modelYear: number | null;
  }>(
    ctx.tx,
    sql`select ${vehicle.id} as "id", ${vehicle.vin} as "vin", ${vehicle.engineNo} as "engineNo",
          ${vehicle.registrationNo} as "registrationNo", ${vehicle.variant} as "variant", ${vehicle.color} as "color",
          ${vehicle.modelYear} as "modelYear"
        from ${vehicle}
        inner join ${vehicleDealership}
          on ${and(eq(vehicleDealership.vehicleId, vehicle.id), eq(vehicleDealership.dealershipId, o.dealershipId as number))}
        where ${and(
          eq(vehicle.modelId, o.modelId as number),
          isNull(vehicle.activatedOn),
          eq(vehicle.status, 'available'),
          sql`not exists (select 1 from ${salesOrder} so where so.vehicle_id = ${vehicle.id} and so.status <> 'cancelled' and so.id <> ${orderId})`,
        )}
        order by ${vehicle.modelYear} desc, ${vehicle.vin}
        limit 50`,
  );
}

async function assertNoScheduledDelivery(ctx: EntityCtx, orderId: number, message: string) {
  const scheduled = await ctx.tx.delivery.findFirst({ where: { salesOrderId: orderId, status: 'scheduled' }, select: { id: true } });
  if (scheduled) throw conflict(message);
}

/** Vehicle status change, audited against the dealership driving it (the sales order's). */
export async function setVehicleStatus(ctx: EntityCtx, vehicleId: number, status: (typeof VEHICLE_STATUSES)[number], dealershipId: number) {
  await ctx.tx.vehicle.updateMany({ where: { id: vehicleId }, data: { status, updatedById: ctx.access.userId } });
  await ctx.audit({ entityType: 'master.vehicle', entityId: vehicleId, action: 'status.update', dealershipId, branchId: null, changes: { status } });
}

export async function allocateVehicle(ctx: EntityCtx, orderId: number, vehicleId: number) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!orders.canOnRow(ctx.access, o, P.ordersAllocate)) throw forbidden();
  if (!isLive(o.status)) throw conflict(`The order is ${o.status as string}`);
  await assertNoScheduledDelivery(ctx, orderId, 'Cancel the scheduled delivery before changing the vehicle');

  const candidates = await allocatableVehicles(ctx, orderId);
  if (!candidates.some((v) => v.id === vehicleId)) {
    throw validationError([
      { in: 'body', path: 'vehicleId', message: 'Choose an undelivered vehicle of the ordered model, in stock at this dealership' },
    ]);
  }
  const before = (o.vehicleId as number | null) ?? null;
  // The partial unique index guarantees no concurrent order takes the same vehicle.
  await ctx.tx.salesOrder.update({ where: { id: orderId }, data: { vehicleId, updatedById: ctx.access.userId } });
  // A car it replaces goes back to free stock (never left booked without an order).
  if (before && before !== vehicleId) await setVehicleStatus(ctx, before, 'available', o.dealershipId as number);
  await ctx.audit({
    entityType: salesOrderEntity.entityType,
    entityId: orderId,
    action: 'allocate',
    dealershipId: o.dealershipId as number,
    branchId: (o.branchId as number | null) ?? null,
    changes: { vehicleId: { from: before, to: vehicleId } },
  });
  await setVehicleStatus(ctx, vehicleId, 'booked', o.dealershipId as number);
  return orders.get(ctx, orderId);
}

export async function releaseVehicle(ctx: EntityCtx, orderId: number) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!orders.canOnRow(ctx.access, o, P.ordersAllocate)) throw forbidden();
  if (!o.vehicleId) return orders.get(ctx, orderId);
  if (o.status === 'delivered') throw conflict('The vehicle has been delivered');
  await assertNoScheduledDelivery(ctx, orderId, 'Cancel the scheduled delivery first');
  const releasedVehicleId = o.vehicleId as number;
  await ctx.tx.salesOrder.update({ where: { id: orderId }, data: { vehicleId: null, updatedById: ctx.access.userId } });
  await ctx.audit({
    entityType: salesOrderEntity.entityType,
    entityId: orderId,
    action: 'release',
    dealershipId: o.dealershipId as number,
    changes: { vehicleId: { from: o.vehicleId, to: null } },
  });
  await setVehicleStatus(ctx, releasedVehicleId, 'available', o.dealershipId as number);
  return orders.get(ctx, orderId);
}

/**
 * Advances the allocated vehicle through the logistics pipeline one step at a time
 * (booked → in_transit → received → ready_for_delivery), or pauses / resumes it via hold.
 * "In transit" (dispatched from the plant) comes after the Manager's approval and may also be set by
 * the Sales Admin / Assistant Manager / Manager (dispatch); every other step is the Delivery Team's
 * (allocate) — "received" only once the car is actually at the dealership.
 */
export async function advanceVehicleStatus(ctx: EntityCtx, orderId: number, input: z.output<typeof AdvanceVehicleStatusBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  const target = input.status;
  const logistics = orders.canOnRow(ctx.access, o, P.ordersAllocate);
  const dispatch = target === 'in_transit' && orders.canOnRow(ctx.access, o, P.ordersDispatch);
  if (!logistics && !dispatch) throw forbidden();
  if (!isLive(o.status)) throw conflict(`The order is ${o.status as string}`);
  if (!o.vehicleId) throw conflict('Allocate a vehicle to the order first');
  const [v] = await query<{ status: string }>(ctx.tx, sql`select ${vehicle.status} as "status" from ${vehicle} where ${vehicle.id} = ${o.vehicleId as number} for update`);
  if (!v) throw notFound('Vehicle');
  // Dispatch alone is the one step booked → in transit (resuming a car on hold is the Delivery Team's).
  if (!logistics && v.status !== 'booked') throw forbidden();
  if (target === 'in_transit' && v.status === 'booked' && o.status !== 'approved') {
    throw conflict("The Manager has to approve the order before the car is marked in transit");
  }

  const ladder = [...VEHICLE_PIPELINE] as string[];
  const from = v.status;
  const allowed = target === 'hold' ? from !== 'hold' : from === 'hold' ? ladder.includes(target) : ladder.indexOf(target) === ladder.indexOf(from) + 1;
  if (!allowed) throw conflict(`Cannot move the vehicle from "${from}" to "${target}"`);
  await setVehicleStatus(ctx, o.vehicleId as number, target, o.dealershipId as number);
  return orders.get(ctx, orderId);
}
