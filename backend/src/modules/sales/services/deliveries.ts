/** Deliveries: scheduled from an approved order with a vehicle; completing one hands the vehicle over. */
import { execute } from '../../../db/client';
import { sql } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { publish } from '../../../events/bus';
import { conflict, forbidden, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { DocType, nextDocumentNumber } from '../../core/documents';
import { formatCnic, normalizeIdentifier } from '../../master/normalize';
import { findVehicleByIdentifiers } from '../../master/repository';
import { activateVehicle, setOwner } from '../../master/service';
import { deliveries, deliveryEntity, orders } from '../entities';
import { delivery } from '../models';
import { pakistanToday } from '../../../lib/dates';
import { SalesPerm as P } from '../permissions';
import { assertCleared } from './orderPayments';
import { setVehicleStatus } from './orders';
import type { CompleteDeliveryBody, ScheduleDeliveryBody } from '../schemas';

// Pakistan calendar day: a car delivered at 1 AM is delivered today, not yesterday.
const today = () => pakistanToday();

export async function scheduleDelivery(ctx: EntityCtx, orderId: number, input: z.output<typeof ScheduleDeliveryBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  const branchId = input.branchId ?? ((o.branchId as number | null) ?? null);
  if (!ctx.access.canIn(P.deliveriesSchedule, { dealershipId: o.dealershipId as number, branchId })) throw forbidden();
  if (o.status !== 'approved') throw conflict('Only approved orders can be scheduled for delivery');
  if (!o.vehicleId) throw conflict('Enter the vehicle (chassis / engine number) on the order first');
  // Scheduled once the car is at the dealership (the Delivery Team marked it received).
  const car = await ctx.tx.vehicle.findFirst({ where: { id: o.vehicleId as number }, select: { status: true } });
  if (car?.status !== 'received' && car?.status !== 'ready_for_delivery') {
    throw conflict('Schedule the delivery once the Delivery Team has marked the car received');
  }
  if (input.scheduledDate < today()) throw validationError([{ in: 'body', path: 'scheduledDate', message: 'Choose today or a later date' }]);

  const existing = await ctx.tx.delivery.findFirst({ where: { salesOrderId: orderId, status: { not: 'cancelled' } }, select: { id: true } });
  if (existing) throw conflict('This order already has a delivery', { existingId: existing.id });

  const row = await ctx.tx.delivery.create({
    data: {
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
    },
  });
  await ctx.audit({
    entityType: deliveryEntity.entityType,
    entityId: row.id,
    action: 'create',
    dealershipId: row.dealershipId,
    branchId: row.branchId,
    changes: { salesOrderId: orderId, scheduledDate: input.scheduledDate },
  });
  // A scheduled car is ready for delivery: the Delivery Team hands it over on the day.
  if (car.status === 'received') await setVehicleStatus(ctx, o.vehicleId as number, 'ready_for_delivery', o.dealershipId as number);
  return deliveries.get(ctx, row.id);
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
  // The Sales Admin must have cleared the car (all payments clear) before it is handed over.
  assertCleared(o);

  const deliveredOn = input.deliveredOn ?? today();
  if (deliveredOn > today()) throw validationError([{ in: 'body', path: 'deliveredOn', message: 'Delivery date cannot be in the future' }]);
  const vehicleId = d.vehicleId as number;
  const dealershipId = d.dealershipId as number;

  if (input.registrationNo) {
    const registrationNo = normalizeIdentifier(input.registrationNo);
    const clash = await findVehicleByIdentifiers(ctx.tx, { registrationNo }, vehicleId);
    if (clash.length) throw conflict('Another vehicle already has this registration number');
    await ctx.tx.vehicle.updateMany({ where: { id: vehicleId }, data: { registrationNo, updatedById: ctx.access.userId } });
  }

  // Hand-written: the handed-over lists are text[] columns (documents_handed_over / accessories_handed_over).
  await execute(
    ctx.tx,
    sql`update ${delivery}
           set delivered_on = ${deliveredOn}::date,
               delivered_at = ${new Date()},
               delivered_by_id = ${ctx.access.userId},
               odometer_km = ${input.odometerKm},
               documents_handed_over = ${input.documentsHandedOver}::text[],
               accessories_handed_over = ${input.accessoriesHandedOver}::text[],
               checklist = ${input.checklist}::text[],
               customer_acknowledged = ${input.customerAcknowledged},
               customer_acknowledged_at = ${new Date()},
               notes = ${input.notes ?? (d.notes as string | null)},
               updated_at = now()
         where ${delivery.id} = ${deliveryId}`,
  );
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
  const v = await ctx.tx.vehicle.findFirst({ where: { id: o.vehicleId as number }, select: { status: true } });
  if (v?.status !== 'ready_for_delivery') throw conflict('Mark the car ready for delivery first');

  const scheduled = await ctx.tx.delivery.findFirst({ where: { salesOrderId: orderId, status: 'scheduled' }, select: { id: true } });
  const deliveryId = scheduled?.id ?? (await scheduleDelivery(ctx, orderId, { scheduledDate: today() })).id;
  return completeDelivery(ctx, deliveryId as number, input);
}

/** Deliveries of an order (latest first); used by the order screen. */
export async function orderDeliveries(ctx: EntityCtx, orderId: number) {
  await orders.findVisible(ctx, orderId);
  const rows = await ctx.tx.delivery.findMany({ where: { salesOrderId: orderId }, orderBy: [{ id: 'desc' }], take: 20 });
  return deliveries.present(ctx, rows as never);
}

/**
 * What the delivery note prints (the dealership's own form: who takes delivery, against which PBO,
 * the vehicle, and the sign-offs on the back). Blank where not known, to be written by hand.
 */
export async function deliveryNote(ctx: EntityCtx, deliveryId: number) {
  const d = await deliveries.findVisible(ctx, deliveryId);
  const o = await ctx.tx.salesOrder.findFirst({
    where: { id: d.salesOrderId as number },
    select: { orderNo: true, pboNo: true, variant: true, color: true, leadId: true, modelId: true },
  });
  const [car, model, buyer, dealer, ppf] = await Promise.all([
    ctx.tx.vehicle.findFirst({ where: { id: d.vehicleId as number }, select: { vin: true, engineNo: true, color: true, variant: true } }),
    o ? ctx.tx.vehicleModel.findFirst({ where: { id: o.modelId }, select: { brand: true, name: true } }) : null,
    ctx.tx.customer.findFirst({ where: { id: d.customerId as number }, select: { fullName: true, cnic: true } }),
    ctx.tx.dealership.findFirst({ where: { id: d.dealershipId as number }, select: { name: true, code: true, brand: true } }),
    // The PBO number as written on the customer's PPF voucher, when there is one.
    o?.leadId ? ctx.tx.ppfForm.findFirst({ where: { leadId: o.leadId, pboNo: { not: null } }, select: { pboNo: true }, orderBy: { id: 'desc' } }) : null,
  ]);
  // A corporate customer: the person takes delivery on behalf of the company.
  const corp = o?.leadId ? await ctx.tx.lead.findFirst({ where: { id: o.leadId }, select: { customerType: true, companyName: true } }) : null;
  return {
    deliveryNo: d.deliveryNo as string,
    status: d.status as string,
    scheduledDate: d.scheduledDate as string,
    deliveredAt: d.deliveredAt ? (d.deliveredAt as Date).toISOString() : null,
    dealership: { name: dealer?.name ?? '', code: dealer?.code ?? '', brand: dealer?.brand ?? '' },
    customer: { name: buyer?.fullName ?? null, cnic: buyer?.cnic ? formatCnic(buyer.cnic) : null },
    onBehalfOf: corp?.customerType === 'corporate' ? (corp.companyName ?? null) : null,
    pboNo: o?.pboNo ?? ppf?.pboNo ?? o?.orderNo ?? null,
    orderNo: o?.orderNo ?? null,
    vehicle: {
      brand: model?.brand ?? null,
      model: model?.name ?? null,
      variant: o?.variant ?? car?.variant ?? null,
      color: o?.color ?? car?.color ?? null,
      chassisNo: car?.vin ?? null,
      engineNo: car?.engineNo ?? null,
    },
    accessories: (d.accessoriesHandedOver as string[] | null) ?? [],
  };
}
