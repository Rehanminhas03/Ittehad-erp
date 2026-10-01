/**
 * Delivery report (Delivery Team, Sales Admin, Assistant Manager, Manager): cars delivered this
 * month, this year, in the last 30 days, all time and in a chosen period, per dealership and all
 * together, with the average days from the Manager's approval to delivery; and, for the chosen
 * period, per model (with its average) and per month (orders booked vs cars delivered). Only the dealerships the caller
 * sees deliveries of (sales.deliveries.view_all), or the one dealership asked for.
 * "Today" is the database's current_date (Pakistan time).
 */
import { scopeWhere } from '../../../auth/access';
import { query } from '../../../db/client';
import { and, eq, sql } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { pakistanToday } from '../../../lib/dates';
import type { z } from '../../../lib/zod';
import { dealership } from '../../core/models';
import { vehicle, vehicleModel } from '../../master/models';
import { delivery, salesOrder } from '../models';
import { SalesPerm as P } from '../permissions';
import type { DeliveryReportQuery } from '../schemas';

interface Counts {
  thisMonth: number;
  thisYear: number;
  last30Days: number;
  allTime: number;
  inPeriod: number;
  scheduled: number;
  /** Average days from the order's approval to delivery, for the cars delivered in the period. */
  avgDaysToDeliver: number | null;
}
const ZERO: Counts = { thisMonth: 0, thisYear: 0, last30Days: 0, allTime: 0, inPeriod: 0, scheduled: 0, avgDaysToDeliver: null };

/** The day the order was approved (its latest approval), in Pakistan time. */
const APPROVED_ON = sql`((select max(wt.occurred_at) from core.workflow_transition wt
  where wt.entity_type = 'sales.order' and wt.entity_id = ${delivery.salesOrderId} and wt.to_state = 'approved') at time zone 'Asia/Karachi')::date`;
const AVG_DAYS = sql`round(avg(${delivery.deliveredOn} - ${APPROVED_ON})::numeric, 1)::float8`;

export async function deliveryReport(ctx: EntityCtx, q: z.output<typeof DeliveryReportQuery>) {
  const today = pakistanToday();
  // The chosen period: default this month (1st to today).
  const from = q.from ?? `${today.slice(0, 7)}-01`;
  const to = q.to ?? today;
  const scope = ctx.access.scope(P.deliveriesViewAll);
  const inScope = and(scopeWhere(scope, { dealership: delivery.dealershipId, branch: delivery.branchId }), q.dealershipId ? eq(delivery.dealershipId, q.dealershipId) : undefined)!;
  const delivered = sql`${delivery.status} = 'delivered'`;
  const period = sql`${delivered} and ${delivery.deliveredOn} between ${from}::date and ${to}::date`;

  // The dealerships shown: those in scope (with none delivered too), or the one asked for.
  const dealerScope = and(
    scope.global ? sql`true` : scopeWhere(scope, { dealership: dealership.id }),
    q.dealershipId ? eq(dealership.id, q.dealershipId) : undefined,
  )!;
  const [dealers, counts, byModel, byMonth] = [
    await query<{ id: number; code: string; name: string; brand: string }>(
      ctx.tx,
      sql`select ${dealership.id} as "id", ${dealership.code} as "code", ${dealership.name} as "name", ${dealership.brand} as "brand"
            from ${dealership} where ${dealership.isActive} and ${dealerScope} order by ${dealership.name}`,
    ),
    await query<Counts & { dealershipId: number }>(
      ctx.tx,
      sql`select ${delivery.dealershipId} as "dealershipId",
                 count(*) filter (where ${delivered} and ${delivery.deliveredOn} >= date_trunc('month', current_date))::int as "thisMonth",
                 count(*) filter (where ${delivered} and ${delivery.deliveredOn} >= date_trunc('year', current_date))::int as "thisYear",
                 count(*) filter (where ${delivered} and ${delivery.deliveredOn} > current_date - 30)::int as "last30Days",
                 count(*) filter (where ${delivered})::int as "allTime",
                 count(*) filter (where ${period})::int as "inPeriod",
                 count(*) filter (where ${delivery.status} = 'scheduled')::int as "scheduled",
                 round((avg(${delivery.deliveredOn} - ${APPROVED_ON}) filter (where ${period}))::numeric, 1)::float8 as "avgDaysToDeliver"
            from ${delivery} where ${inScope} group by ${delivery.dealershipId}`,
    ),
    await query<{ brand: string; model: string; delivered: number; avgDaysToDeliver: number | null }>(
      ctx.tx,
      sql`select ${vehicleModel.brand} as "brand", ${vehicleModel.name} as "model", count(*)::int as "delivered", ${AVG_DAYS} as "avgDaysToDeliver"
            from ${delivery} join ${vehicle} on ${vehicle.id} = ${delivery.vehicleId} join ${vehicleModel} on ${vehicleModel.id} = ${vehicle.modelId}
           where ${inScope} and ${period}
           group by 1, 2 order by 3 desc, 1, 2`,
    ),
    await query<{ month: string; delivered: number }>(
      ctx.tx,
      sql`select to_char(date_trunc('month', ${delivery.deliveredOn}), 'YYYY-MM') as "month", count(*)::int as "delivered"
            from ${delivery} where ${inScope} and ${period} group by 1 order by 1`,
    ),
  ];
  // Orders booked per month in the period (not cancelled), next to the cars delivered.
  const orderScope = and(
    scopeWhere(ctx.access.scope(P.deliveriesViewAll), { dealership: salesOrder.dealershipId, branch: salesOrder.branchId }),
    q.dealershipId ? eq(salesOrder.dealershipId, q.dealershipId) : undefined,
  )!;
  const booked = await query<{ month: string; booked: number }>(
    ctx.tx,
    sql`select to_char(date_trunc('month', ${salesOrder.createdAt} at time zone 'Asia/Karachi'), 'YYYY-MM') as "month", count(*)::int as "booked"
          from ${salesOrder}
         where ${orderScope} and ${salesOrder.status} <> 'cancelled'
           and (${salesOrder.createdAt} at time zone 'Asia/Karachi')::date between ${from}::date and ${to}::date
         group by 1`,
  );
  const months = [...new Set([...booked.map((b) => b.month), ...byMonth.map((m) => m.month)])].sort();
  const bookedVsDelivered = months.map((month) => ({
    month,
    booked: booked.find((b) => b.month === month)?.booked ?? 0,
    delivered: byMonth.find((m) => m.month === month)?.delivered ?? 0,
  }));

  const byDealer = new Map(counts.map((c) => [c.dealershipId, c]));
  const rows = dealers.map((d) => {
    const c = byDealer.get(d.id);
    return { ...d, ...ZERO, ...(c ? { ...c, dealershipId: undefined } : {}) };
  });
  const total = rows.reduce<Counts>(
    (t, r) => ({
      thisMonth: t.thisMonth + r.thisMonth,
      thisYear: t.thisYear + r.thisYear,
      last30Days: t.last30Days + r.last30Days,
      allTime: t.allTime + r.allTime,
      inPeriod: t.inPeriod + r.inPeriod,
      scheduled: t.scheduled + r.scheduled,
      avgDaysToDeliver: null,
    }),
    { ...ZERO },
  );
  // All together: weighted by the cars each dealership delivered in the period.
  const timed = rows.filter((r) => r.avgDaysToDeliver != null && r.inPeriod > 0);
  const n = timed.reduce((s, r) => s + r.inPeriod, 0);
  total.avgDaysToDeliver = n ? Math.round((timed.reduce((s, r) => s + r.avgDaysToDeliver! * r.inPeriod, 0) / n) * 10) / 10 : null;
  return {
    asOf: today,
    period: { from, to },
    dealerships: rows.map(({ dealershipId: _d, ...r }) => r),
    total,
    byModel,
    byMonth: bookedVsDelivered,
  };
}
