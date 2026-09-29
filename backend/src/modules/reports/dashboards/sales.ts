import { query } from '../../../db/client';
import { and, eq, inArray, ne, sql, type SQL } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { user } from '../../core/models';
import { vehicleModel } from '../../master/models';
import { delivery, lead, salesOrder } from '../../sales/models';
import { assemble, fmtMoney, humanize, m, monthly, n, pct, StatsByDealership } from '../engine';
import { ReportsPerm as P } from '../permissions';
import type { DashboardQuery } from '../schemas';
import { ReportScope } from '../scope';

const count = sql`count(*)::int`;
const month = (col: SQL) => sql`to_char(date_trunc('month', ${col}), 'YYYY-MM')`;

/** Sales: leads and conversion, orders booked, vehicles delivered, discounting, pipeline. */
export async function salesDashboard(ctx: EntityCtx, q: z.output<typeof DashboardQuery>) {
  const scope = new ReportScope(ctx, { view: P.salesView, viewOwn: P.salesViewOwn }, q);
  const leadScope = scope.where({ dealership: lead.dealershipId, branch: lead.branchId, owner: lead.ownerId });
  const orderScope = scope.where({ dealership: salesOrder.dealershipId, branch: salesOrder.branchId, owner: salesOrder.salespersonId });
  const deliveryScope = scope.where({ dealership: delivery.dealershipId, branch: delivery.branchId, owner: delivery.salespersonId });
  const delivered = and(deliveryScope, eq(delivery.status, 'delivered'))!;
  const live = ne(salesOrder.status, 'cancelled');
  const stats = new StatsByDealership();

  stats.put(
    await query<{ d: number; leads: number; won: number }>(
      ctx.tx,
      sql`select ${lead.dealershipId} as "d", ${count} as "leads",
                 (count(*) filter (where ${lead.status} in ('converted', 'processing', 'completed')))::int as "won"
            from ${lead}
           where ${and(leadScope, scope.inPeriod(lead.createdAt))}
           group by ${lead.dealershipId}`,
    ),
  );
  stats.put(
    await query<{ d: number; booked: number; bookedValue: string; listValue: string; discount: string }>(
      ctx.tx,
      sql`select ${salesOrder.dealershipId} as "d", ${count} as "booked",
                 sum(${salesOrder.totalAmount})::text as "bookedValue",
                 sum(${salesOrder.unitPrice})::text as "listValue",
                 sum(${salesOrder.discount})::text as "discount"
            from ${salesOrder}
           where ${and(orderScope, live, scope.inPeriod(salesOrder.createdAt))}
           group by ${salesOrder.dealershipId}`,
    ),
  );
  stats.put(
    await query<{ d: number; delivered: number; deliveredValue: string }>(
      ctx.tx,
      sql`select ${delivery.dealershipId} as "d", ${count} as "delivered", sum(${salesOrder.totalAmount})::text as "deliveredValue"
            from ${delivery}
           inner join ${salesOrder} on ${eq(salesOrder.id, delivery.salesOrderId)}
           where ${and(delivered, scope.inPeriod(delivery.deliveredOn))}
           group by ${delivery.dealershipId}`,
    ),
  );
  stats.put(
    await query<{ d: number; open: number; openValue: string }>(
      ctx.tx,
      sql`select ${salesOrder.dealershipId} as "d", ${count} as "open", sum(${salesOrder.totalAmount})::text as "openValue"
            from ${salesOrder}
           where ${and(orderScope, inArray(salesOrder.status, ['submitted', 'approved']))}
           group by ${salesOrder.dealershipId}`,
    ),
  );

  const trend = await query<{ month: string; value: number }>(
    ctx.tx,
    sql`select ${month(delivery.deliveredOn)} as "month", ${count} as "value"
          from ${delivery}
         where ${and(delivered, scope.inTrend(delivery.deliveredOn))}
         group by ${month(delivery.deliveredOn)}`,
  );
  const byModel = await query<{ label: string; value: number }>(
    ctx.tx,
    sql`select ${vehicleModel.brand} || ' ' || ${vehicleModel.name} as "label", ${count} as "value"
          from ${salesOrder}
         inner join ${vehicleModel} on ${eq(vehicleModel.id, salesOrder.modelId)}
         where ${and(orderScope, live, scope.inPeriod(salesOrder.createdAt))}
         group by ${vehicleModel.brand}, ${vehicleModel.name}
         order by ${count} desc
         limit 8`,
  );
  const bySource = await query<{ label: string; value: number }>(
    ctx.tx,
    sql`select ${lead.source} as "label", ${count} as "value"
          from ${lead}
         where ${and(leadScope, scope.inPeriod(lead.createdAt))}
         group by ${lead.source}
         order by ${count} desc`,
  );

  const tables = [];
  if (scope.mode !== 'own') {
    const booked = await query<{ id: number; name: string; booked: number; value: string }>(
      ctx.tx,
      sql`select ${salesOrder.salespersonId} as "id", ${user.fullName} as "name", ${count} as "booked", sum(${salesOrder.totalAmount})::text as "value"
            from ${salesOrder}
           inner join ${user} on ${eq(user.id, salesOrder.salespersonId)}
           where ${and(orderScope, live, scope.inPeriod(salesOrder.createdAt))}
           group by ${salesOrder.salespersonId}, ${user.fullName}
           order by sum(${salesOrder.totalAmount}) desc
           limit 10`,
    );
    const deliveredBy = await query<{ id: number; delivered: number }>(
      ctx.tx,
      sql`select ${delivery.salespersonId} as "id", ${count} as "delivered"
            from ${delivery}
           where ${and(delivered, scope.inPeriod(delivery.deliveredOn))}
           group by ${delivery.salespersonId}`,
    );
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
