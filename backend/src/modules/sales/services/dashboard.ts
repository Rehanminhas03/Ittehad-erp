/**
 * Personal sales dashboard: counts and a daily series for the signed-in user, always within their own
 * view scope (the same conditions as the lists), so a Salesperson sees only their leads, an Admin
 * only converted ones, and so on. Sections the user cannot see are left out.
 */
import { and, count, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { forbidden } from '../../../lib/errors';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { vehicle } from '../../master/models';
import { deliveries, leads, orders, stock } from '../entities';
import { delivery, lead, leadFollowUp, salesOrder } from '../models';
import { SalesPerm as P } from '../permissions';
import type { DashboardQuery, LeadSummaryQuery } from '../schemas';
import { addDays, pakistanToday } from '../../../lib/dates';

const OPEN = ['new', 'follow_up', 'visited'];
/** Today in Pakistan (UTC+5, no DST). */
const localToday = () => pakistanToday();
const karachiDate = (col: SQL | unknown) => sql`(${col} at time zone 'Asia/Karachi')::date`;

async function statusCounts(ctx: EntityCtx, table: typeof lead | typeof salesOrder | typeof vehicle, where: SQL) {
  const rows = await ctx.tx
    .select({ status: table.status, n: count() })
    .from(table)
    .where(where)
    .groupBy(table.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

/**
 * Total leads and the split by status, above the leads list: the caller's own scope and the list's
 * filters (latest-activity dates, salesperson, source, sent to AM), so the numbers match the list.
 */
export async function leadSummary(ctx: EntityCtx, q: z.output<typeof LeadSummaryQuery>) {
  const { access } = ctx;
  if (q.ownerId && !access.hasAny([P.leadsViewAll, P.leadsViewConverted])) throw forbidden();
  const where = and(
    leads.viewCondition(access),
    q.ownerId ? eq(lead.ownerId, q.ownerId) : undefined,
    q.source ? eq(lead.source, q.source) : undefined,
    q.escalated === undefined ? undefined : q.escalated ? isNotNull(lead.escalatedAt) : isNull(lead.escalatedAt),
    q.activityFrom ? sql`${karachiDate(lead.updatedAt)} >= ${q.activityFrom}::date` : undefined,
    q.activityTo ? sql`${karachiDate(lead.updatedAt)} <= ${q.activityTo}::date` : undefined,
  )!;
  const byStatus = await statusCounts(ctx, lead, where);
  return { total: Object.values(byStatus).reduce((n, v) => n + v, 0), byStatus };
}

export async function salesDashboard(ctx: EntityCtx, q: z.output<typeof DashboardQuery>) {
  const { access } = ctx;
  const to = q.to ?? localToday();
  const from = q.from ?? addDays(to, -(q.days - 1));
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1;
  const out: Record<string, unknown> = { period: { from, to, days } };
  // One person's figures: only for those who see the team (a salesperson always sees their own).
  const person = q.ownerId;
  if (person && !access.hasAny([P.leadsViewAll, P.leadsViewConverted, P.ordersViewAll, P.deliveriesViewAll, P.reportsView])) throw forbidden();

  if (access.hasAny([P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted])) {
    const scope = and(leads.viewCondition(access), person ? eq(lead.ownerId, person) : undefined)!;
    const byStatus = await statusCounts(ctx, lead, scope);
    // "Today" figures always mean today, whatever period is chosen.
    const now = localToday();
    const [today] = await ctx.tx.select({ n: count() }).from(lead).where(and(scope, sql`${karachiDate(lead.createdAt)} = ${now}::date`));
    const [escalated] = await ctx.tx
      .select({ n: count() })
      .from(lead)
      .where(and(scope, isNotNull(lead.escalatedAt), sql`${lead.status} in ('new', 'follow_up', 'visited')`));
    const [followUps] = await ctx.tx
      .select({ n: count() })
      .from(leadFollowUp)
      .where(and(eq(leadFollowUp.createdById, person ?? access.userId), sql`${karachiDate(leadFollowUp.createdAt)} = ${now}::date`));
    const { rows: daily } = await ctx.tx.execute<{ date: string; logged: number; converted: number }>(sql`
      select to_char(g.d, 'YYYY-MM-DD') as date,
        (select count(*)::int from ${lead} where ${scope} and ${karachiDate(lead.createdAt)} = g.d) as logged,
        (select count(*)::int from ${lead} where ${scope} and ${karachiDate(lead.convertedAt)} = g.d) as converted
      from generate_series(${from}::date, ${to}::date, interval '1 day') as g(d)
      order by g.d`);
    const total = Object.values(byStatus).reduce((n, v) => n + v, 0);
    const [inPeriod] = await ctx.tx
      .select({ n: count() })
      .from(lead)
      .where(and(scope, sql`${karachiDate(lead.createdAt)} between ${from}::date and ${to}::date`));
    out.leads = {
      byStatus,
      total,
      loggedInPeriod: inPeriod?.n ?? 0,
      open: OPEN.reduce((n, s) => n + (byStatus[s] ?? 0), 0),
      loggedToday: today?.n ?? 0,
      escalatedOpen: escalated?.n ?? 0,
      myFollowUpsToday: followUps?.n ?? 0,
      daily,
    };
  }

  if (access.hasAny([P.ordersViewAll, P.ordersViewOwn])) {
    const scope = and(orders.viewCondition(access), person ? eq(salesOrder.salespersonId, person) : undefined)!;
    const [waiting] = await ctx.tx
      .select({ n: count() })
      .from(salesOrder)
      // Booked (not yet delivered or cancelled) and no car on it yet: the Delivery Team's to-do.
      .where(and(scope, sql`${salesOrder.status} in ('draft', 'submitted', 'approved')`, sql`${salesOrder.vehicleId} is null`));
    out.orders = { byStatus: await statusCounts(ctx, salesOrder, scope), awaitingVehicle: waiting?.n ?? 0 };
  }

  if (access.hasAny([P.stockView])) {
    const scope = stock.viewCondition(access);
    const [free] = await ctx.tx
      .select({ n: count() })
      .from(vehicle)
      .where(and(scope, sql`not exists (select 1 from ${salesOrder} so where so.vehicle_id = ${vehicle.id} and so.status <> 'cancelled')`));
    out.stock = { byStatus: await statusCounts(ctx, vehicle, scope), free: free?.n ?? 0 };
  }

  if (access.hasAny([P.deliveriesViewAll, P.deliveriesViewOwn])) {
    const scope = and(deliveries.viewCondition(access), person ? eq(delivery.salespersonId, person) : undefined)!;
    const [scheduled] = await ctx.tx.select({ n: count() }).from(delivery).where(and(scope, eq(delivery.status, 'scheduled')));
    const [delivered] = await ctx.tx
      .select({ n: count() })
      .from(delivery)
      .where(and(scope, eq(delivery.status, 'delivered'), sql`${delivery.deliveredOn} between ${from}::date and ${to}::date`));
    out.deliveries = { scheduled: scheduled?.n ?? 0, deliveredInPeriod: delivered?.n ?? 0 };
  }
  return out;
}
