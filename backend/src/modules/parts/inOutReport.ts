/**
 * The parts in and out report: for a period, each part's pieces in (received, transferred in, taken back from the workshop,
 * adjusted up) and out (issued to repair orders / counter sales, transferred out, adjusted down), at cost and the price
 * charged for what went out. Within the caller's stores.
 */
import { scopeWhere } from '../../auth/access';
import { query } from '../../db/client';
import { type SQL, and, eq, sql } from '../../db/sql';
import type { EntityCtx } from '../../entity/types';
import type { z } from '../../lib/zod';
import { inventoryTransaction, part } from './models';
import { PartsPerm as P } from './permissions';
import type { InOutReportQuery } from './schemas';

export async function inOutReport(ctx: EntityCtx, f: z.output<typeof InOutReportQuery>) {
  const conds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: inventoryTransaction.dealershipId, branch: inventoryTransaction.branchId })];
  if (f.dealershipId) conds.push(eq(inventoryTransaction.dealershipId, f.dealershipId));
  if (f.branchId) conds.push(eq(inventoryTransaction.branchId, f.branchId));
  const day = sql`(${inventoryTransaction.occurredAt} at time zone 'Asia/Karachi')::date`;
  if (f.from) conds.push(sql`${day} >= ${f.from}::date`);
  if (f.to) conds.push(sql`${day} <= ${f.to}::date`);
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(sql`(${part.partNo} ilike ${like} or ${part.description} ilike ${like})`);
  }
  const q = inventoryTransaction.quantity;
  const v = inventoryTransaction.value;
  const price = sql`(coalesce(${inventoryTransaction.unitPrice}, ${part.sellingPrice}) * (1 - coalesce(${inventoryTransaction.discountPercent}, 0) / 100))`;
  const rows = await query<{
    partId: number; partNo: string; description: string; inQty: string; inCost: string; outQty: string; outCost: string; outPrice: string;
  }>(
    ctx.tx,
    sql`select ${part.id} as "partId", ${part.partNo} as "partNo", ${part.description} as "description",
               coalesce(sum(${q}) filter (where ${q} > 0), 0)::text as "inQty",
               round(coalesce(sum(${v}) filter (where ${q} > 0), 0), 2)::text as "inCost",
               coalesce(-sum(${q}) filter (where ${q} < 0), 0)::text as "outQty",
               round(coalesce(-sum(${v}) filter (where ${q} < 0), 0), 2)::text as "outCost",
               round(coalesce(-sum(${q} * ${price}) filter (where ${inventoryTransaction.type} in ('issue', 'return')), 0), 2)::text as "outPrice"
          from ${inventoryTransaction}
          inner join ${part} on ${part.id} = ${inventoryTransaction.partId}
         where ${and(...conds)!}
         group by ${part.id}
         order by ${part.partNo}
         limit 5000`,
  );
  const sum = (k: 'inQty' | 'inCost' | 'outQty' | 'outCost' | 'outPrice') => rows.reduce((n, r) => n + Number(r[k]), 0);
  return {
    parts: rows,
    totals: { inQty: String(sum('inQty')), inCost: sum('inCost').toFixed(2), outQty: String(sum('outQty')), outCost: sum('outCost').toFixed(2), outPrice: sum('outPrice').toFixed(2), partsCount: rows.length },
  };
}
