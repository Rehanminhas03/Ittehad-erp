/**
 * The delivery pipeline (Deliveries page): every booked order until its car is delivered, by stage —
 *   waiting     no car yet, or the car is booked / on hold (not yet dispatched)
 *   in_transit  dispatched from the plant / head office
 *   received    at the dealership (received, or ready) and no delivery scheduled yet
 *   scheduled   a delivery is scheduled
 *   delivered   handed over
 * Orders staff (orders / deliveries view_all) see their dealerships' orders; a salesperson sees the
 * orders raised from their own leads (the car's stage of their customers).
 */
import { scopeWhere } from '../../../auth/access';
import { query } from '../../../db/client';
import { type SQL, and, eq, ilike, or, sql } from '../../../db/sql';
import { escapeLike } from '../../../entity/entityService';
import type { EntityCtx } from '../../../entity/types';
import { pakistanToday } from '../../../lib/dates';
import type { z } from '../../../lib/zod';
import { dealership, user } from '../../core/models';
import { customer, vehicle, vehicleModel } from '../../master/models';
import { delivery, salesOrder } from '../models';
import { SalesPerm as P } from '../permissions';
import type { DeliveryPipelineQuery } from '../schemas';

export const PIPELINE_STAGES = ['waiting', 'in_transit', 'received', 'scheduled', 'delivered'] as const;

/** Orders the caller may follow here: their dealerships' orders, or (a salesperson) their own customers'. */
export function pipelineScope(ctx: EntityCtx): SQL {
  const cols = { dealership: salesOrder.dealershipId, branch: salesOrder.branchId };
  const staff = scopeWhere(ctx.access.scope(P.ordersViewAll, P.deliveriesViewAll), cols);
  const own = and(scopeWhere(ctx.access.scope(P.leadsViewOwn, P.ordersViewOwn, P.deliveriesViewOwn), cols), eq(salesOrder.salespersonId, ctx.access.userId))!;
  return or(staff, own)!;
}

/** The stage of an order (see above), from its car and its (live) delivery. */
const STAGE = sql`case
  when ${salesOrder.status} = 'delivered' or ${delivery.status} = 'delivered' then 'delivered'
  when ${delivery.status} = 'scheduled' then 'scheduled'
  when ${vehicle.status} in ('received', 'ready_for_delivery') then 'received'
  when ${vehicle.status} = 'in_transit' then 'in_transit'
  else 'waiting' end`;

/** When the Manager approved the order (its latest approval). */
const APPROVED_AT = sql`(select max(wt.occurred_at) from core.workflow_transition wt
  where wt.entity_type = 'sales.order' and wt.entity_id = ${salesOrder.id} and wt.to_state = 'approved')`;

const FROM = sql`${salesOrder}
  join ${dealership} on ${dealership.id} = ${salesOrder.dealershipId}
  left join ${customer} on ${customer.id} = ${salesOrder.customerId}
  left join ${user} on ${user.id} = ${salesOrder.salespersonId}
  left join ${vehicleModel} on ${vehicleModel.id} = ${salesOrder.modelId}
  left join ${vehicle} on ${vehicle.id} = ${salesOrder.vehicleId}
  left join ${delivery} on ${delivery.salesOrderId} = ${salesOrder.id} and ${delivery.status} <> 'cancelled'`;

export interface PipelineRow {
  orderId: number;
  orderNo: string;
  pboNo: string | null;
  orderStatus: string;
  leadId: number | null;
  dealershipId: number;
  dealershipName: string;
  customerName: string | null;
  salespersonName: string | null;
  model: string | null;
  variant: string | null;
  color: string | null;
  vehicleId: number | null;
  chassisNo: string | null;
  engineNo: string | null;
  vehicleStatus: string | null;
  deliveryId: number | null;
  deliveryNo: string | null;
  scheduledDate: string | null;
  deliveredOn: string | null;
  approvedAt: string | null;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  bookedAt: string;
  stage: (typeof PIPELINE_STAGES)[number];
}

export async function deliveryPipeline(ctx: EntityCtx, q: z.output<typeof DeliveryPipelineQuery>) {
  const conds: (SQL | undefined)[] = [pipelineScope(ctx), sql`${salesOrder.status} <> 'cancelled'`];
  if (q.dealershipId) conds.push(eq(salesOrder.dealershipId, q.dealershipId));
  // Past the expected delivery and the car has not arrived (the "overdue" alert).
  if (q.overdue) {
    conds.push(sql`${salesOrder.expectedDeliveryDate} < ${pakistanToday()}::date and ${salesOrder.status} <> 'delivered'
      and (${vehicle.status} is null or ${vehicle.status} not in ('received', 'ready_for_delivery', 'delivered'))`);
  }
  // The period: when the order was booked; a delivered car, when it was delivered.
  const day = sql`(case when ${STAGE} = 'delivered'
      then coalesce(${delivery.deliveredOn}, (${salesOrder.updatedAt} at time zone 'Asia/Karachi')::date)
      else (${salesOrder.createdAt} at time zone 'Asia/Karachi')::date end)`;
  if (q.from) conds.push(sql`${day} >= ${q.from}::date`);
  if (q.to) conds.push(sql`${day} <= ${q.to}::date`);
  if (q.q?.trim()) {
    const p = `%${escapeLike(q.q.trim())}%`;
    conds.push(or(ilike(salesOrder.orderNo, p), ilike(salesOrder.pboNo, p), ilike(customer.fullName, p), ilike(vehicle.vin, p), ilike(vehicle.engineNo, p)));
  }
  const where = and(...conds)!;
  const stage = q.stage ?? 'waiting';
  // Oldest first while waiting; by date for scheduled; latest first once delivered.
  const order =
    stage === 'scheduled'
      ? sql`${delivery.scheduledDate} asc, ${salesOrder.id} asc`
      : stage === 'delivered'
        ? sql`${delivery.deliveredOn} desc nulls last, ${salesOrder.id} desc`
        : sql`coalesce(${APPROVED_AT}, ${salesOrder.createdAt}) asc, ${salesOrder.id} asc`;

  const [counts, rows] = [
    await query<{ stage: string; n: number }>(ctx.tx, sql`select ${STAGE} as "stage", count(*)::int as "n" from ${FROM} where ${where} group by 1`),
    await query<PipelineRow & { total: number }>(
      ctx.tx,
      sql`select ${salesOrder.id} as "orderId", ${salesOrder.orderNo} as "orderNo", ${salesOrder.pboNo} as "pboNo", ${salesOrder.status} as "orderStatus", ${salesOrder.leadId} as "leadId",
                 ${salesOrder.dealershipId} as "dealershipId", ${dealership.name} as "dealershipName",
                 ${customer.fullName} as "customerName", ${user.fullName} as "salespersonName",
                 ${vehicleModel.brand} || ' ' || ${vehicleModel.name} as "model", ${salesOrder.variant} as "variant", ${salesOrder.color} as "color",
                 ${vehicle.id} as "vehicleId", ${vehicle.vin} as "chassisNo", ${vehicle.engineNo} as "engineNo", ${vehicle.status} as "vehicleStatus",
                 ${delivery.id} as "deliveryId", ${delivery.deliveryNo} as "deliveryNo",
                 ${delivery.scheduledDate}::text as "scheduledDate", ${delivery.deliveredOn}::text as "deliveredOn",
                 ${APPROVED_AT} as "approvedAt", ${salesOrder.expectedDeliveryDate}::text as "expectedDeliveryDate", ${salesOrder.expectedDeliveryByMonth} as "expectedDeliveryByMonth", ${salesOrder.createdAt} as "bookedAt",
                 ${STAGE} as "stage", count(*) over ()::int as "total"
            from ${FROM}
           where ${where} and ${STAGE} = ${stage}
           order by ${order}
           limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`,
    ),
  ];
  const byStage = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, counts.find((c) => c.stage === s)?.n ?? 0])) as Record<(typeof PIPELINE_STAGES)[number], number>;
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : ((v as string | null) ?? null));
  return {
    stage,
    counts: byStage,
    items: rows.map(({ total: _t, ...r }) => ({ ...r, approvedAt: iso(r.approvedAt), bookedAt: iso(r.bookedAt)! })),
    total: rows[0]?.total ?? byStage[stage],
    page: q.page,
    pageSize: q.pageSize,
  };
}
