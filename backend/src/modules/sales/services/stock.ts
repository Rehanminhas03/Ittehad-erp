/** Open stock (Delivery Team): registering incoming vehicles at a dealership. */
import { eq } from 'drizzle-orm';
import type { EntityCtx } from '../../../entity/types';
import { conflict, forbidden, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { assertActiveModel } from '../../master/entities';
import { vehicle, vehicleDealership } from '../../master/models';
import { findVehicleByIdentifiers } from '../../master/repository';
import { orders, salesOrderEntity, stock } from '../entities';
import { salesOrder } from '../models';
import { SalesPerm as P } from '../permissions';
import type { StockVehicleCreate } from '../schemas';
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
    if (!orders.canOnRow(ctx.access, o, P.ordersAllocate)) throw forbidden();
    const bad = (message: string) => validationError([{ in: 'body', path: 'orderId', message }]);
    if (o.dealershipId !== dealershipId) throw bad('That order is at another dealership');
    if (!(LIVE_ORDER_STATES as readonly string[]).includes(o.status as string)) throw bad(`That order is ${o.status as string}`);
    if (o.vehicleId) throw bad('That order already has a vehicle');
    if (o.modelId !== fields.modelId) throw bad('That order is for a different model');
  }

  const [v] = await ctx.tx
    .insert(vehicle)
    .values({
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
    })
    .returning({ id: vehicle.id });
  await ctx.tx.insert(vehicleDealership).values({ vehicleId: v!.id, dealershipId, source: 'manual', createdById: ctx.access.userId });
  await ctx.audit({ entityType: 'sales.stock_vehicle', entityId: v!.id, action: 'create', dealershipId, branchId: null, changes: input });

  if (o) {
    await ctx.tx.update(salesOrder).set({ vehicleId: v!.id, updatedById: ctx.access.userId }).where(eq(salesOrder.id, o.id as number));
    await ctx.audit({
      entityType: salesOrderEntity.entityType,
      entityId: o.id as number,
      action: 'allocate',
      dealershipId,
      branchId: (o.branchId as number | null) ?? null,
      changes: { vehicleId: { from: null, to: v!.id }, vehicleStatus: 'received' },
    });
  }
  return stock.get(ctx, v!.id);
}
