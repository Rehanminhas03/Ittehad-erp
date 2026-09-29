import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { user } from '../../core/models';
import { vehicleModel } from '../../master/models';
import { delivery, lead, salesOrder } from '../../sales/models';
import { assemble, fmtMoney, humanize, m, monthly, n, pct, StatsByDealership } from '../engine';
import { ReportsPerm as P } from '../permissions';
import type { DashboardQuery } from '../schemas';
import { ReportScope } from '../scope';

const count = sql<number>`count(*)::int`;
const month = (col: unknown) => sql<string>`to_char(date_trunc('month', ${col}), 'YYYY-MM')`;

/** Sales: leads and conversion, orders booked, vehicles delivered, discounting, pipeline. */
export async function salesDashboard(ctx: EntityCtx, q: z.output<typeof DashboardQuery>) {
  const scope = new ReportScope(ctx, { view: P.salesView, viewOwn: P.salesViewOwn }, q);
  const leadScope = scope.where({ dealership: lead.dealershipId, branch: lead.branchId, owner: lead.ownerId });
  const orderScope = scope.where({ dealership: salesOrder.dealershipId, branch: salesOrder.branchId, owner: salesOrder.salespersonId });
  const deliveryScope = scope.where({ dealership: delivery.dealershipId, branch: delivery.branchId, owner: delivery.salespersonId });
  const delivered = and(deliveryScope, eq(delivery.status, 'delivered'));
  const live = ne(salesOrder.status, 'cancelled');
  const stats = new StatsByDealership();

  stats.put(
    await ctx.tx
      .select({ d: lead.dealershipId, leads: count, won: sql<number>`(count(*) filter (where ${lead.status} in ('converted', 'processing', 'completed')))::int` })
      .from(lead)
      .where(and(leadScope, scope.inPeriod(lead.createdAt)))
      .groupBy(lead.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({
        d: salesOrder.dealershipId,
        booked: count,
        bookedValue: sql<string>`sum(${salesOrder.totalAmount})::text`,
        listValue: sql<string>`sum(${salesOrder.unitPrice})::text`,
        discount: sql<string>`sum(${salesOrder.discount})::text`,
      })
      .from(salesOrder)
      .where(and(orderScope, live, scope.inPeriod(salesOrder.createdAt)))
      .groupBy(salesOrder.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({ d: delivery.dealershipId, delivered: count, deliveredValue: sql<string>`sum(${salesOrder.totalAmount})::text` })
      .from(delivery)
      .innerJoin(salesOrder, eq(salesOrder.id, delivery.salesOrderId))
      .where(and(delivered, scope.inPeriod(delivery.deliveredOn)))
      .groupBy(delivery.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({ d: salesOrder.dealershipId, open: count, openValue: sql<string>`sum(${salesOrder.totalAmount})::text` })
      .from(salesOrder)
      .where(and(orderScope, inArray(salesOrder.status, ['submitted', 'approved'])))
      .groupBy(salesOrder.dealershipId),
  );

  const trend = await ctx.tx
    .select({ month: month(delivery.deliveredOn), value: count })
    .from(delivery)
    .where(and(delivered, scope.inTrend(delivery.deliveredOn)))
    .groupBy(month(delivery.deliveredOn));
  const byModel = await ctx.tx
    .select({ label: sql<string>`${vehicleModel.brand} || ' ' || ${vehicleModel.name}`, value: count })
    .from(salesOrder)
    .innerJoin(vehicleModel, eq(vehicleModel.id, salesOrder.modelId))
    .where(and(orderScope, live, scope.inPeriod(salesOrder.createdAt)))
    .groupBy(vehicleModel.brand, vehicleModel.name)
    .orderBy(desc(count))
    .limit(8);
  const bySource = await ctx.tx
    .select({ label: lead.source, value: count })
    .from(lead)
    .where(and(leadScope, scope.inPeriod(lead.createdAt)))
    .groupBy(lead.source)
    .orderBy(desc(count));

  const tables = [];
  if (scope.mode !== 'own') {
    const booked = await ctx.tx
      .select({ id: salesOrder.salespersonId, name: user.fullName, booked: count, value: sql<string>`sum(${salesOrder.totalAmount})::text` })
      .from(salesOrder)
      .innerJoin(user, eq(user.id, salesOrder.salespersonId))
      .where(and(orderScope, live, scope.inPeriod(salesOrder.createdAt)))
      .groupBy(salesOrder.salespersonId, user.fullName)
      .orderBy(desc(sql`sum(${salesOrder.totalAmount})`))
      .limit(10);
    const deliveredBy = await ctx.tx
      .select({ id: delivery.salespersonId, delivered: count })
      .from(delivery)
      .where(and(delivered, scope.inPeriod(delivery.deliveredOn)))
      .groupBy(delivery.salespersonId);
    const dMap = new Map(deliveredBy.map((r) => [r.id, r.delivered]));
    tables.push({
      key: 'by-salesperson',
      title: 'Top salespeople',
      columns: [
        { key: 'name', header: 'Salesperson', format: 'text' as const },
        { key: 'booked', header: 'Orders booked', format: 'number' as const },
        { key: 'value', header: 'Booked value', format: 'money' as const },
        { key: 'delivered', header: 'Delivered', format: 'number' as const },
      ],
      rows: booked.map((r) => ({ name: r.name, booked: r.booked, value: r.value, delivered: dMap.get(r.id) ?? 0 })),
    });
  }

  return assemble(
    'sales',
    'Sales',
    scope,
    stats,
    [
      { key: 'leads', label: 'New leads', format: 'number', value: (s) => n(s, 'leads'), hint: (s) => `${n(s, 'won')} converted`, to: '/sales/leads', compare: true },
      { key: 'conversion', label: 'Lead conversion', format: 'percent', value: (s) => pct(n(s, 'won'), n(s, 'leads')), hint: () => 'of leads created in the period', compare: true },
      { key: 'booked', label: 'Orders booked', format: 'number', value: (s) => n(s, 'booked'), to: '/sales/orders', compare: true },
      { key: 'bookedValue', label: 'Booked value', format: 'money', value: (s) => m(s, 'bookedValue'), compare: true },
      { key: 'delivered', label: 'Vehicles delivered', format: 'number', value: (s) => n(s, 'delivered'), to: '/sales/deliveries?status=delivered', compare: true },
      { key: 'deliveredValue', label: 'Delivered sales value', format: 'money', value: (s) => m(s, 'deliveredValue'), compare: true },
      { key: 'discount', label: 'Average discount', format: 'percent', value: (s) => pct(Number(m(s, 'discount')), Number(m(s, 'listValue'))), hint: () => 'of list price, orders booked' },
      { key: 'open', label: 'Open orders', format: 'number', value: (s) => n(s, 'open'), hint: (s) => `${fmtMoney(m(s, 'openValue'))} in the pipeline`, to: '/sales/orders?status=approved' },
    ],
    {
      charts: [
        { key: 'deliveries-trend', title: 'Deliveries per month', format: 'number', data: monthly(scope.months, trend), to: '/sales/deliveries' },
        { key: 'orders-by-model', title: 'Orders by model', format: 'number', data: byModel.map((r) => ({ label: r.label, value: r.value })), to: null },
        { key: 'leads-by-source', title: 'Leads by source', format: 'number', data: bySource.map((r) => ({ label: humanize(r.label), value: r.value })), to: null },
      ],
      tables,
    },
  );
}
