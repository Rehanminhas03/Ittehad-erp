import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { branch } from '../../core/models';
import { inventoryTransaction, part, partsRequest, purchaseOrder, stockItem } from '../../parts/models';
import { assemble, m, monthly, n, StatsByDealership } from '../engine';
import { ReportsPerm as P } from '../permissions';
import type { DashboardQuery } from '../schemas';
import { ReportScope } from '../scope';

const count = sql<number>`count(*)::int`;
const money = (expr: ReturnType<typeof sql>) => sql<string>`coalesce(${expr}, 0)::numeric(14, 2)::text`;
const month = (col: unknown) => sql<string>`to_char(date_trunc('month', ${col}), 'YYYY-MM')`;
const stockValue = sql`sum(${stockItem.quantityOnHand} * ${stockItem.averageCost})`;
const lowStock = sql<number>`(count(*) filter (where ${stockItem.reorderLevel} > 0 and ${stockItem.quantityOnHand} <= ${stockItem.reorderLevel}))::int`;
/** Issues are negative movements; returns positive. Net consumption is their negated sum. */
const consumed = sql`-sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} in ('issue', 'return'))`;

/** Parts: stock value and health, purchasing, consumption by the workshop. */
export async function partsDashboard(ctx: EntityCtx, q: z.output<typeof DashboardQuery>) {
  const scope = new ReportScope(ctx, { view: P.partsView }, q);
  const stockScope = scope.where({ dealership: stockItem.dealershipId, branch: stockItem.branchId });
  const moveScope = scope.where({ dealership: inventoryTransaction.dealershipId, branch: inventoryTransaction.branchId });
  const stats = new StatsByDealership();

  stats.put(
    await ctx.tx
      .select({
        d: stockItem.dealershipId,
        stockValue: money(stockValue),
        stocked: sql<number>`(count(*) filter (where ${stockItem.quantityOnHand} > 0))::int`,
        low: lowStock,
      })
      .from(stockItem)
      .where(stockScope)
      .groupBy(stockItem.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({
        d: inventoryTransaction.dealershipId,
        received: money(sql`sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} = 'receipt')`),
        consumed: money(consumed),
        adjusted: money(sql`sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} = 'adjustment')`),
      })
      .from(inventoryTransaction)
      .where(and(moveScope, scope.inPeriod(inventoryTransaction.occurredAt)))
      .groupBy(inventoryTransaction.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({ d: partsRequest.dealershipId, openRequests: count })
      .from(partsRequest)
      .where(and(scope.where({ dealership: partsRequest.dealershipId, branch: partsRequest.branchId }), inArray(partsRequest.status, ['open', 'partially_issued'])))
      .groupBy(partsRequest.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({
        d: purchaseOrder.dealershipId,
        poAwaiting: sql<number>`(count(*) filter (where ${purchaseOrder.status} = 'submitted'))::int`,
        onOrder: money(sql`sum(${purchaseOrder.totalAmount}) filter (where ${purchaseOrder.status} in ('approved', 'partially_received'))`),
      })
      .from(purchaseOrder)
      .where(scope.where({ dealership: purchaseOrder.dealershipId, branch: purchaseOrder.branchId }))
      .groupBy(purchaseOrder.dealershipId),
  );

  const trend = await ctx.tx
    .select({ month: month(inventoryTransaction.occurredAt), value: money(consumed) })
    .from(inventoryTransaction)
    .where(and(moveScope, scope.inTrend(inventoryTransaction.occurredAt)))
    .groupBy(month(inventoryTransaction.occurredAt));
  const topParts = await ctx.tx
    .select({ label: sql<string>`${part.partNo} || ' ' || ${part.description}`, value: money(consumed) })
    .from(inventoryTransaction)
    .innerJoin(part, eq(part.id, inventoryTransaction.partId))
    .where(and(moveScope, scope.inPeriod(inventoryTransaction.occurredAt), inArray(inventoryTransaction.type, ['issue', 'return'])))
    .groupBy(part.partNo, part.description)
    .orderBy(desc(consumed))
    .limit(8);
  const byBranch = await ctx.tx
    .select({ name: branch.name, stockValue: money(stockValue), stocked: sql<number>`(count(*) filter (where ${stockItem.quantityOnHand} > 0))::int`, low: lowStock })
    .from(stockItem)
    .innerJoin(branch, eq(branch.id, stockItem.branchId))
    .where(stockScope)
    .groupBy(branch.id, branch.name)
    .orderBy(desc(stockValue))
    .limit(20);

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
