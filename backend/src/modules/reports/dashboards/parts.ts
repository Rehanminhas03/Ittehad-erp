import { query } from '../../../db/client';
import { type SQL, and, inArray, sql } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { branch } from '../../core/models';
import { inventoryTransaction, part, partsRequest, purchaseOrder, stockItem } from '../../parts/models';
import { assemble, m, monthly, n, StatsByDealership } from '../engine';
import { ReportsPerm as P } from '../permissions';
import type { DashboardQuery } from '../schemas';
import { ReportScope } from '../scope';

const count = sql`count(*)::int`;
const money = (expr: SQL) => sql`coalesce(${expr}, 0)::numeric(14, 2)::text`;
const month = (col: SQL) => sql`to_char(date_trunc('month', ${col}), 'YYYY-MM')`;
const stockValue = sql`sum(${stockItem.quantityOnHand} * ${stockItem.averageCost})`;
const lowStock = sql`(count(*) filter (where ${stockItem.reorderLevel} > 0 and ${stockItem.quantityOnHand} <= ${stockItem.reorderLevel}))::int`;
/** Issues are negative movements; returns positive. Net consumption is their negated sum. */
const consumed = sql`-sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} in ('issue', 'return'))`;

type Stats = { d: number } & Record<string, number | string>;

/** Parts: stock value and health, purchasing, consumption by the workshop. */
export async function partsDashboard(ctx: EntityCtx, q: z.output<typeof DashboardQuery>) {
  const scope = new ReportScope(ctx, { view: P.partsView }, q);
  const stockScope = scope.where({ dealership: stockItem.dealershipId, branch: stockItem.branchId });
  const moveScope = scope.where({ dealership: inventoryTransaction.dealershipId, branch: inventoryTransaction.branchId });
  const stats = new StatsByDealership();

  stats.put(
    await query<Stats>(
      ctx.tx,
      sql`select ${stockItem.dealershipId} as d, ${money(stockValue)} as "stockValue",
                 (count(*) filter (where ${stockItem.quantityOnHand} > 0))::int as "stocked", ${lowStock} as "low"
            from ${stockItem}
           where ${stockScope}
           group by ${stockItem.dealershipId}`,
    ),
  );
  stats.put(
    await query<Stats>(
      ctx.tx,
      sql`select ${inventoryTransaction.dealershipId} as d,
                 ${money(sql`sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} = 'receipt')`)} as "received",
                 ${money(consumed)} as "consumed",
                 ${money(sql`sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} = 'adjustment')`)} as "adjusted"
            from ${inventoryTransaction}
           where ${and(moveScope, scope.inPeriod(inventoryTransaction.occurredAt))!}
           group by ${inventoryTransaction.dealershipId}`,
    ),
  );
  stats.put(
    await query<Stats>(
      ctx.tx,
      sql`select ${partsRequest.dealershipId} as d, ${count} as "openRequests"
            from ${partsRequest}
           where ${and(scope.where({ dealership: partsRequest.dealershipId, branch: partsRequest.branchId }), inArray(partsRequest.status, ['open', 'partially_issued']))!}
           group by ${partsRequest.dealershipId}`,
    ),
  );
  stats.put(
    await query<Stats>(
      ctx.tx,
      sql`select ${purchaseOrder.dealershipId} as d,
                 (count(*) filter (where ${purchaseOrder.status} = 'submitted'))::int as "poAwaiting",
                 ${money(sql`sum(${purchaseOrder.totalAmount}) filter (where ${purchaseOrder.status} in ('approved', 'partially_received'))`)} as "onOrder"
            from ${purchaseOrder}
           where ${scope.where({ dealership: purchaseOrder.dealershipId, branch: purchaseOrder.branchId })}
           group by ${purchaseOrder.dealershipId}`,
    ),
  );

  const trend = await query<{ month: string; value: string }>(
    ctx.tx,
    sql`select ${month(inventoryTransaction.occurredAt)} as "month", ${money(consumed)} as "value"
          from ${inventoryTransaction}
         where ${and(moveScope, scope.inTrend(inventoryTransaction.occurredAt))!}
         group by ${month(inventoryTransaction.occurredAt)}`,
  );
  const topParts = await query<{ label: string; value: string }>(
    ctx.tx,
    sql`select ${part.partNo} || ' ' || ${part.description} as "label", ${money(consumed)} as "value"
          from ${inventoryTransaction}
          inner join ${part} on ${part.id} = ${inventoryTransaction.partId}
         where ${and(moveScope, scope.inPeriod(inventoryTransaction.occurredAt), inArray(inventoryTransaction.type, ['issue', 'return']))!}
         group by ${part.partNo}, ${part.description}
         order by ${consumed} desc
         limit 8`,
  );
  const byBranch = await query<{ name: string; stockValue: string; stocked: number; low: number }>(
    ctx.tx,
    sql`select ${branch.name} as "name", ${money(stockValue)} as "stockValue",
               (count(*) filter (where ${stockItem.quantityOnHand} > 0))::int as "stocked", ${lowStock} as "low"
          from ${stockItem}
          inner join ${branch} on ${branch.id} = ${stockItem.branchId}
         where ${stockScope}
         group by ${branch.id}, ${branch.name}
         order by ${stockValue} desc
         limit 20`,
  );

  return assemble(
    'parts',
    'Parts & inventory',
    scope,
    stats,
    [
      { key: 'stockValue', label: 'Stock value (at cost)', format: 'money', value: (s) => m(s, 'stockValue'), hint: (s) => `${n(s, 'stocked')} parts in stock`, to: '/parts/stock', compare: true },
      { key: 'low', label: 'At or below reorder level', format: 'number', value: (s) => n(s, 'low'), to: '/parts/stock', compare: true },
      { key: 'received', label: 'Goods received', format: 'money', value: (s) => m(s, 'received'), hint: () => 'at cost, in the period', to: '/parts/goods-receipts', compare: true },
      { key: 'consumed', label: 'Issued to workshop', format: 'money', value: (s) => m(s, 'consumed'), hint: () => 'at cost, net of returns', to: '/parts/movements?type=issue', compare: true },
      { key: 'adjusted', label: 'Stock adjustments', format: 'money', value: (s) => m(s, 'adjusted'), hint: () => 'net value, in the period', to: '/parts/adjustments' },
      { key: 'openRequests', label: 'Parts requests to issue', format: 'number', value: (s) => n(s, 'openRequests'), to: '/parts/requests?status=open' },
      { key: 'poAwaiting', label: 'POs awaiting approval', format: 'number', value: (s) => n(s, 'poAwaiting'), to: '/parts/purchase-orders?status=submitted' },
      { key: 'onOrder', label: 'On order', format: 'money', value: (s) => m(s, 'onOrder'), hint: () => 'approved POs not yet received', to: '/parts/purchase-orders?status=approved' },
    ],
    {
      charts: [
        { key: 'consumption-trend', title: 'Parts issued per month (cost)', format: 'money', data: monthly(scope.months, trend), to: '/parts/movements' },
        { key: 'top-parts', title: 'Most used parts (cost)', format: 'money', data: topParts.map((r) => ({ label: r.label, value: Number(r.value) })), to: null },
      ],
      tables: [
        {
          key: 'by-branch',
          title: 'Stock by branch',
          columns: [
            { key: 'name', header: 'Branch', format: 'text' },
            { key: 'stockValue', header: 'Stock value', format: 'money' },
            { key: 'stocked', header: 'Parts in stock', format: 'number' },
            { key: 'low', header: 'Low stock', format: 'number' },
          ],
          rows: byBranch,
        },
      ],
    },
  );
}
