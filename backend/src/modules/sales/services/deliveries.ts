/** Deliveries: scheduled from an approved order with a vehicle; completing one hands the vehicle over. */
import { and, desc, eq, ne } from 'drizzle-orm';
import type { EntityCtx } from '../../../entity/types';
import { publish } from '../../../events/bus';
import { conflict, forbidden, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { DocType, nextDocumentNumber } from '../../core/documents';
import { vehicle } from '../../master/models';
import { normalizeIdentifier } from '../../master/normalize';
import { findVehicleByIdentifiers } from '../../master/repository';
import { activateVehicle, setOwner } from '../../master/service';
import { deliveries, deliveryEntity, orders } from '../entities';
import { delivery } from '../models';
import { pakistanToday } from '../../../lib/dates';
import { SalesPerm as P } from '../permissions';
import type { CompleteDeliveryBody, ScheduleDeliveryBody } from '../schemas';

// Pakistan calendar day: a car delivered at 1 AM is delivered today, not yesterday.
const today = () => pakistanToday();

export async function scheduleDelivery(ctx: EntityCtx, orderId: number, input: z.output<typeof ScheduleDeliveryBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  const branchId = input.branchId ?? ((o.branchId as number | null) ?? null);
  if (!ctx.access.canIn(P.deliveriesSchedule, { dealershipId: o.dealershipId as number, branchId })) throw forbidden();
  if (o.status !== 'approved') throw conflict('Only approved orders can be scheduled for delivery');
  if (!o.vehicleId) throw conflict('Enter the vehicle (chassis / engine number) on the order first');
  if (input.scheduledDate < today()) throw validationError([{ in: 'body', path: 'scheduledDate', message: 'Choose today or a later date' }]);

  const [existing] = await ctx.tx
    .select({ id: delivery.id })
    .from(delivery)
    .where(and(eq(delivery.salesOrderId, orderId), ne(delivery.status, 'cancelled')));
  if (existing) throw conflict('This order already has a delivery', { existingId: existing.id });

  const [row] = await ctx.tx
    .insert(delivery)
    .values({
      dealershipId: o.dealershipId as number,
      branchId,
      deliveryNo: await nextDocumentNumber(ctx.tx, o.dealershipId as number, DocType.delivery),
      salesOrderId: orderId,
      vehicleId: o.vehicleId as number,
      customerId: o.customerId as number,
      salespersonId: o.salespersonId as number,
      scheduledDate: input.scheduledDate,
      notes: input.notes ?? null,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    })
    .returning();
  await ctx.audit({
    entityType: deliveryEntity.entityType,
    entityId: row!.id,
    action: 'create',
    dealershipId: row!.dealershipId,
    branchId: row!.branchId,
    changes: { salesOrderId: orderId, scheduledDate: input.scheduledDate },
  });
  return deliveries.get(ctx, row!.id);
}

/**
 * Hands the vehicle over. In one transaction:
 *   delivery → delivered, order → delivered (its lead → completed), customer becomes the owner,
 *   vehicle activated (warranty + service schedule start), `vehicle.activated` published.
 */
export async function completeDelivery(ctx: EntityCtx, deliveryId: number, input: z.output<typeof CompleteDeliveryBody>) {
  const d = await deliveries.findVisible(ctx, deliveryId, { lock: true });
  if (!deliveries.canOnRow(ctx.access, d, P.deliveriesComplete)) throw forbidden();
  if (d.status !== 'scheduled') throw conflict(`This delivery is ${d.status as string}`);
  // Authorised through the delivery; the completer need not have rights on sales orders.
  const o = await orders.findById(ctx, d.salesOrderId as number, { lock: true });
  if (o.status !== 'approved' || o.vehicleId !== d.vehicleId) throw conflict('The order is no longer approved for this vehicle');

  const deliveredOn = input.deliveredOn ?? today();
  if (deliveredOn > today()) throw validationError([{ in: 'body', path: 'deliveredOn', message: 'Delivery date cannot be in the future' }]);
  const vehicleId = d.vehicleId as number;
  const dealershipId = d.dealershipId as number;

  if (input.registrationNo) {
    const registrationNo = normalizeIdentifier(input.registrationNo);
    const clash = await findVehicleByIdentifiers(ctx.tx, { registrationNo }, vehicleId);
    if (clash.length) throw conflict('Another vehicle already has this registration number');
    await ctx.tx.update(vehicle).set({ registrationNo, updatedById: ctx.access.userId }).where(eq(vehicle.id, vehicleId));
  }

  await ctx.tx
    .update(delivery)
    .set({
      deliveredOn,
      deliveredAt: new Date(),
      deliveredById: ctx.access.userId,
      odometerKm: input.odometerKm,
      documentsHandedOver: input.documentsHandedOver,
      accessoriesHandedOver: input.accessoriesHandedOver,
      customerAcknowledged: input.customerAcknowledged,
      customerAcknowledgedAt: new Date(),
      notes: input.notes ?? (d.notes as string | null),
    })
    .where(eq(delivery.id, deliveryId));
  await deliveries.transition(ctx, deliveryId, 'complete', undefined, { system: true });
  await orders.transition(ctx, o.id, 'deliver', `Delivered (${d.deliveryNo as string})`, { system: true });

  await setOwner(ctx, vehicleId, d.customerId as number, dealershipId, deliveredOn);
  const v = await activateVehicle(ctx, vehicleId, { dealershipId, activatedOn: deliveredOn, odometerKm: input.odometerKm });
  await publish(ctx, {
    type: 'vehicle.activated',
    dealershipId,
    aggregateType: 'master.vehicle',
    aggregateId: vehicleId,
    payload: {
      vehicleId,
      modelId: v.modelId,
      customerId: d.customerId as number,
      activatedOn: deliveredOn,
      odometerKm: input.odometerKm,
      salesOrderId: o.id,
      deliveryId,
    },
  });
  return deliveries.get(ctx, deliveryId);
}

/**
 * "Mark as delivered" on the order (Delivery Team): once the Manager has approved it and its car is
 * ready for delivery, hands the car over in one step. Uses the order's scheduled delivery, or
 * schedules one for today, then completes it (see completeDelivery).
 */
export async function deliverOrder(ctx: EntityCtx, orderId: number, input: z.output<typeof CompleteDeliveryBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!ctx.access.canIn(P.deliveriesComplete, { dealershipId: o.dealershipId as number, branchId: (o.branchId as number | null) ?? null })) throw forbidden();
  if (o.status !== 'approved') throw conflict("The Manager has to approve the order before the car is handed over");
  if (!o.vehicleId) throw conflict('Allocate the car to the order first');
  const [v] = await ctx.tx.select({ status: vehicle.status }).from(vehicle).where(eq(vehicle.id, o.vehicleId as number));
  if (v?.status !== 'ready_for_delivery') throw conflict('Mark the car ready for delivery first');

  const [scheduled] = await ctx.tx
    .select({ id: delivery.id })
    .from(delivery)
    .where(and(eq(delivery.salesOrderId, orderId), eq(delivery.status, 'scheduled')));
  const deliveryId = scheduled?.id ?? (await scheduleDelivery(ctx, orderId, { scheduledDate: today() })).id;
  return completeDelivery(ctx, deliveryId as number, input);
}

/** Deliveries of an order (latest first); used by the order screen. */
export async function orderDeliveries(ctx: EntityCtx, orderId: number) {
  await orders.findVisible(ctx, orderId);
  const rows = await ctx.tx.select().from(delivery).where(eq(delivery.salesOrderId, orderId)).orderBy(desc(delivery.id)).limit(20);
  return deliveries.present(ctx, rows as never);
}
