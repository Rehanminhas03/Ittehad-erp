/**
 * The purchase report: for a period, the parts ordered (purchase orders) and received (goods receipts) with their cost.
 * A part's cost is the weighted average of what it was received at (total cost / quantity), so 30 pieces at 500 and
 * 25 at 700 average 590.91; every receipt line is returned too, as the part's price history. Within the caller's stores.
 */
import { scopeWhere } from '../../auth/access';
import { query } from '../../db/client';
import { type SQL, and, eq, sql } from '../../db/sql';
import type { EntityCtx } from '../../entity/types';
import type { z } from '../../lib/zod';
import { branch as branchTable } from '../core/models';
import { goodsReceipt, goodsReceiptLine, part, purchaseOrder, purchaseOrderLine, supplier } from './models';
import { PartsPerm as P } from './permissions';
import type { PurchaseReportQuery } from './schemas';

type Line = { partId: number; date: string; grnNo: string; poNo: string | null; supplier: string; store: string; quantity: string; unitCost: string; amount: string };

export async function purchaseReport(ctx: EntityCtx, f: z.output<typeof PurchaseReportQuery>) {
  const like = f.q ? `%${f.q}%` : null;
  const partMatch = like ? sql` and (${part.partNo} ilike ${like} or ${part.description} ilike ${like})` : sql``;
  const rConds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: goodsReceipt.dealershipId, branch: goodsReceipt.branchId })];
  if (f.dealershipId) rConds.push(eq(goodsReceipt.dealershipId, f.dealershipId));
  if (f.branchId) rConds.push(eq(goodsReceipt.branchId, f.branchId));
  if (f.supplierId) rConds.push(eq(goodsReceipt.supplierId, f.supplierId));
  const inRange = (col: unknown) => [f.from ? sql`${col} >= ${f.from}::date` : undefined, f.to ? sql`${col} <= ${f.to}::date` : undefined].filter((c): c is SQL => !!c);
  const received = and(...rConds, ...inRange(goodsReceipt.receivedDate))!;
  const allTime = and(...rConds)!;

  const lines = await query<Line>(
    ctx.tx,
    sql`select ${goodsReceiptLine.partId} as "partId", to_char(${goodsReceipt.receivedDate}, 'DD-Mon-YYYY') as "date", ${goodsReceipt.grnNo} as "grnNo",
               ${purchaseOrder.poNo} as "poNo", ${supplier.name} as "supplier", ${branchTable.name} as "store",
               ${goodsReceiptLine.quantity}::text as "quantity", ${goodsReceiptLine.unitCost}::text as "unitCost", ${goodsReceiptLine.amount}::text as "amount"
          from ${goodsReceiptLine}
          inner join ${goodsReceipt} on ${goodsReceipt.id} = ${goodsReceiptLine.goodsReceiptId}
          inner join ${part} on ${part.id} = ${goodsReceiptLine.partId}
          inner join ${supplier} on ${supplier.id} = ${goodsReceipt.supplierId}
          inner join ${branchTable} on ${branchTable.id} = ${goodsReceipt.branchId}
          left join ${purchaseOrder} on ${purchaseOrder.id} = ${goodsReceipt.purchaseOrderId}
         where ${received}${partMatch}
         order by ${goodsReceipt.receivedDate} asc, ${goodsReceipt.id} asc, ${goodsReceiptLine.id} asc
         limit 20000`,
  );
  const got = await query<{ partId: number; partNo: string; description: string; receivedQty: string; receivedCost: string; minCost: string; maxCost: string }>(
    ctx.tx,
    sql`select ${part.id} as "partId", ${part.partNo} as "partNo", ${part.description} as "description",
               sum(${goodsReceiptLine.quantity})::text as "receivedQty", sum(${goodsReceiptLine.amount})::text as "receivedCost",
               min(${goodsReceiptLine.unitCost})::text as "minCost", max(${goodsReceiptLine.unitCost})::text as "maxCost"
          from ${goodsReceiptLine}
          inner join ${goodsReceipt} on ${goodsReceipt.id} = ${goodsReceiptLine.goodsReceiptId}
          inner join ${part} on ${part.id} = ${goodsReceiptLine.partId}
         where ${received}${partMatch}
         group by ${part.id}`,
  );
  const avgAll = await query<{ partId: number; average: string | null }>(
    ctx.tx,
    sql`select ${goodsReceiptLine.partId} as "partId", (sum(${goodsReceiptLine.amount}) / nullif(sum(${goodsReceiptLine.quantity}), 0))::numeric(14,2)::text as "average"
          from ${goodsReceiptLine} inner join ${goodsReceipt} on ${goodsReceipt.id} = ${goodsReceiptLine.goodsReceiptId}
         where ${allTime} group by ${goodsReceiptLine.partId}`,
  );
  const oConds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: purchaseOrder.dealershipId, branch: purchaseOrder.branchId }), sql`${purchaseOrder.status} <> 'cancelled'`];
  if (f.dealershipId) oConds.push(eq(purchaseOrder.dealershipId, f.dealershipId));
  if (f.branchId) oConds.push(eq(purchaseOrder.branchId, f.branchId));
  if (f.supplierId) oConds.push(eq(purchaseOrder.supplierId, f.supplierId));
  oConds.push(...inRange(purchaseOrder.orderDate));
  const ordered = await query<{ partId: number; partNo: string; description: string; orderedQty: string; orderedValue: string }>(
    ctx.tx,
    sql`select ${part.id} as "partId", ${part.partNo} as "partNo", ${part.description} as "description",
               sum(${purchaseOrderLine.quantity})::text as "orderedQty", sum(${purchaseOrderLine.amount})::text as "orderedValue"
          from ${purchaseOrderLine}
          inner join ${purchaseOrder} on ${purchaseOrder.id} = ${purchaseOrderLine.purchaseOrderId}
          inner join ${part} on ${part.id} = ${purchaseOrderLine.partId}
         where ${and(...oConds)!}${partMatch}
         group by ${part.id}`,
  );

  const avgOf = new Map(avgAll.map((r) => [r.partId, r.average]));
  const lastOf = new Map<number, Line>();
  for (const l of lines) lastOf.set(l.partId, l);
  type Row = { partId: number; partNo: string; description: string; orderedQty: string; orderedValue: string; receivedQty: string; receivedCost: string; minCost: string | null; maxCost: string | null };
  const merged = new Map<number, Row>();
  for (const o of ordered) merged.set(o.partId, { ...o, receivedQty: '0', receivedCost: '0', minCost: null, maxCost: null });
  for (const g of got) merged.set(g.partId, { orderedQty: '0', orderedValue: '0', ...merged.get(g.partId), ...g });
  const num = (v: string) => Number(v);
  const parts = [...merged.values()]
    .map((m) => ({
      ...m,
      averageCost: num(m.receivedQty) > 0 ? (num(m.receivedCost) / num(m.receivedQty)).toFixed(2) : '0.00',
      lastCost: lastOf.get(m.partId)?.unitCost ?? null,
      lastDate: lastOf.get(m.partId)?.date ?? null,
      allTimeAverage: avgOf.get(m.partId) ?? null,
    }))
    .sort((a, b) => a.partNo.localeCompare(b.partNo));
  const sum = (xs: string[]) => xs.reduce((s, v) => s + num(v), 0);
  return {
    parts,
    lines,
    totals: {
      orderedValue: sum(parts.map((p) => p.orderedValue)).toFixed(2),
      receivedQty: String(sum(parts.map((p) => p.receivedQty))),
      receivedCost: sum(parts.map((p) => p.receivedCost)).toFixed(2),
      partsCount: parts.length,
    },
  };
}
