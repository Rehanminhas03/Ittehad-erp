/** Open stock (Delivery Team): registering incoming vehicles at a dealership. */
import type { EntityCtx } from '../../../entity/types';
import { conflict, forbidden, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { assertActiveModel } from '../../master/entities';
import { findVehicleByIdentifiers } from '../../master/repository';
import { orders, salesOrderEntity, stock } from '../entities';
import { SalesPerm as P } from '../permissions';
import type { PdiBody, StockVehicleCreate } from '../schemas';
import { saveVehiclePdi, savePdi } from './pdi';
import { LIVE_ORDER_STATES } from './orders';

/**
 * Registers an incoming vehicle at the dealership. Chassis and engine numbers are unique across the
 * group, so a vehicle already known anywhere is rejected (never duplicated).
 *   - For a booked order (`orderId`): the car is linked to that order and marked **received**.
 *   - Otherwise it is **available** (free) stock, to be allocated from an order later.
 */
export async function receiveStockVehicle(ctx: EntityCtx, input: z.output<typeof StockVehicleCreate>) {
  const { dealershipId, orderId, ...fields } = input;
  if (!ctx.access.canIn(P.stockManage, { dealershipId })) throw forbidden();
  await assertActiveModel(ctx, fields.modelId);
  const [clash] = await findVehicleByIdentifiers(ctx.tx, { vin: fields.vin, engineNo: fields.engineNo ?? null });
  if (clash) throw conflict('A vehicle with this chassis or engine number already exists in the group', { existingId: clash.id });

  // The order it arrived for: same dealership and model, booked, and still without a car.
  const o = orderId ? await orders.findVisible(ctx, orderId, { lock: true }) : null;
  if (o) {
    // The Delivery Team (allocate) or the Sales Admin (who also enters the car on the order).
    if (!orders.canOnRow(ctx.access, o, P.ordersAllocate) && !orders.canOnRow(ctx.access, o, P.ordersUpdate)) throw forbidden();
    const bad = (message: string) => validationError([{ in: 'body', path: 'orderId', message }]);
    if (o.dealershipId !== dealershipId) throw bad('That order is at another dealership');
    if (!(LIVE_ORDER_STATES as readonly string[]).includes(o.status as string)) throw bad(`That order is ${o.status as string}`);
    if (o.vehicleId) throw bad('That order already has a vehicle');
    if (o.modelId !== fields.modelId) throw bad('That order is for a different model');
  }

  const v = await ctx.tx.vehicle.create({
    data: {
      vin: fields.vin,
      engineNo: fields.engineNo ?? null,
      modelId: fields.modelId,
      variant: fields.variant ?? null,
      color: fields.color ?? null,
      modelYear: fields.modelYear ?? null,
      notes: fields.notes ?? null,
      status: o ? 'received' : 'available',
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    },
    select: { id: true },
  });
  await ctx.tx.vehicleDealership.create({ data: { vehicleId: v.id, dealershipId, source: 'manual', createdById: ctx.access.userId } });
  await ctx.audit({ entityType: 'sales.stock_vehicle', entityId: v.id, action: 'create', dealershipId, branchId: null, changes: input });

  if (fields.pdi) await saveVehiclePdi(ctx, v.id, fields.pdi);
  if (o) {
    await ctx.tx.salesOrder.update({ where: { id: o.id }, data: { vehicleId: v.id, updatedById: ctx.access.userId } });
    if (fields.pdi) await savePdi(ctx, { ...o, vehicleId: v.id }, fields.pdi);
    await ctx.audit({
      entityType: salesOrderEntity.entityType,
      entityId: o.id as number,
      action: 'allocate',
      dealershipId,
      branchId: (o.branchId as number | null) ?? null,
      changes: { vehicleId: { from: null, to: v.id }, vehicleStatus: 'received' },
    });
  }
  return stock.get(ctx, v.id);
}

/**
 * Record or correct the PDI of a car in stock (free stock, or one on an order: the order shows the same PDI).
 * Delivery Team / Sales Admin of a dealership the car belongs to.
 */
export async function recordStockPdi(ctx: EntityCtx, vehicleId: number, input: z.output<typeof PdiBody>) {
  const row = await stock.findVisible(ctx, vehicleId, { lock: true });
  const links = await ctx.tx.vehicleDealership.findMany({ where: { vehicleId }, select: { dealershipId: true } });
  if (!links.some((l) => ctx.access.canIn(P.stockManage, { dealershipId: l.dealershipId }))) throw forbidden();
  await saveVehiclePdi(ctx, vehicleId, input);
  // The order the car is on shows the same PDI.
  const o = await ctx.tx.salesOrder.findFirst({ where: { vehicleId, status: { not: 'cancelled' } }, select: { id: true } });
  if (o) {
    const order = await orders.findById(ctx, o.id);
    await savePdi(ctx, order, input);
  }
  await ctx.audit({ entityType: 'sales.stock_vehicle', entityId: row.id as number, action: 'pdi.record', dealershipId: links[0]!.dealershipId, branchId: null, changes: { pdi: input } });
  return stock.get(ctx, vehicleId);
}
