import { scopeWhere } from '../../auth/access';
import { execute, query } from '../../db/client';
import { type SQL, and, eq, gte, inArray, lt, sql } from '../../db/sql';
import { LineService } from '../../entity/lines';
import type { EntityCtx, Row } from '../../entity/types';
import { publish } from '../../events/bus';
import { conflict, forbidden, validationError } from '../../lib/errors';
import { lineAmount } from '../../lib/money';
import { type PageQuery, offsetOf } from '../../lib/pagination';
import type { z } from '../../lib/zod';
import { DocType, nextDocumentNumber } from '../core/documents';
import { branch as branchTable, user } from '../core/models';
import { jobCards } from '../service/entities';
import {
  adjustments,
  assertPartNotOnDocument,
  goodsReceipts,
  partsRequests,
  purchaseOrders,
  normalizePartNo,
  resolvePart,
  transfers,
} from './entities';
import {
  goodsReceipt,
  goodsReceiptLine,
  inventoryTransaction,
  part,
  partsRequest,
  partsRequestLine,
  purchaseOrder,
  purchaseOrderLine,
  stockAdjustmentLine,
  stockItem,
  stockTransferLine,
} from './models';
import { PartsPerm as P } from './permissions';
import {
  AdjustmentLineCreate,
  AdjustmentLineUpdate,
  PurchaseOrderLineCreate,
  PurchaseOrderLineSchema,
  PurchaseOrderLineUpdate,
  StockLineSchema,
  TransferLineCreate,
  TransferLineUpdate,
  type DirectReceiveBody,
  type IssueBody,
  type MonthlyReportQuery,
  type PartImportBody,
  type StockSheetQuery,
  type PartsRequestCreate,
  type ReceiveBody,
  type StockMovementQuery,
} from './schemas';
import { moveStockLines, sumValues } from './stock';

const today = () => new Date().toISOString().slice(0, 10);
/** Decimal comparison/arithmetic in Postgres numeric (exact). */
async function numeric<T extends Record<string, string>>(ctx: EntityCtx, statement: SQL): Promise<T> {
  const rows = await query<T>(ctx.tx, statement);
  return rows[0] as T;
}

// =============================================================================
// Document lines: purchase orders, transfers, adjustments
// =============================================================================
/** Resolves the part on create (or when the part number changes) and rejects duplicates. */
function partLinePrepare(
  table: typeof purchaseOrderLine | typeof stockTransferLine | typeof stockAdjustmentLine,
  parentCol: typeof purchaseOrderLine.purchaseOrderId,
  priced: boolean,
) {
  return async (ctx: EntityCtx, parent: Row, data: Record<string, unknown>, before?: Row) => {
    const out = { ...data };
    if (!before || (data.partNo && data.partNo !== before.partNo)) {
      const p = await resolvePart(ctx, String(data.partNo));
      await assertPartNotOnDocument(ctx, table, parentCol, parent.id, p.id, before?.id);
      Object.assign(out, { partId: p.id, partNo: p.partNo, description: p.description });
    }
    if (priced) out.amount = lineAmount(String(out.unitPrice), String(out.quantity));
    return out;
  };
}

async function recomputePoTotal(ctx: EntityCtx, po: Row) {
  await execute(
    ctx.tx,
    sql`update ${purchaseOrder} set total_amount = (select coalesce(sum(amount), 0) from ${purchaseOrderLine} where purchase_order_id = ${po.id}) where id = ${po.id}`,
  );
}

export const purchaseOrderLines = new LineService({
  parent: purchaseOrders,
  table: purchaseOrderLine,
  parentKey: 'purchaseOrderId',
  names: { singular: 'PurchaseOrderLine', plural: 'PurchaseOrderLines' },
  schemas: { read: PurchaseOrderLineSchema, create: PurchaseOrderLineCreate, update: PurchaseOrderLineUpdate },
  editPermission: P.purchaseOrdersUpdate,
  maxLines: 200,
  sortKey: 'createdAt',
  locked: (p) => (p.status !== 'draft' ? 'Only draft purchase orders can be changed' : null),
  prepare: partLinePrepare(purchaseOrderLine, purchaseOrderLine.purchaseOrderId, true),
  afterChange: recomputePoTotal,
});

export const transferLines = new LineService({
  parent: transfers,
  table: stockTransferLine,
  parentKey: 'stockTransferId',
  names: { singular: 'StockTransferLine', plural: 'StockTransferLines' },
  schemas: { read: StockLineSchema, create: TransferLineCreate, update: TransferLineUpdate },
  editPermission: P.transfersCreate,
  maxLines: 200,
  sortKey: 'createdAt',
  locked: (p) => (p.status !== 'draft' ? 'Only draft transfers can be changed' : null),
  prepare: partLinePrepare(stockTransferLine, stockTransferLine.stockTransferId as never, false),
});

export const adjustmentLines = new LineService({
  parent: adjustments,
  table: stockAdjustmentLine,
  parentKey: 'stockAdjustmentId',
  names: { singular: 'StockAdjustmentLine', plural: 'StockAdjustmentLines' },
  schemas: { read: StockLineSchema, create: AdjustmentLineCreate, update: AdjustmentLineUpdate },
  editPermission: P.adjustmentsCreate,
  maxLines: 200,
  sortKey: 'createdAt',
  locked: (p) => (p.status !== 'draft' ? 'Only draft adjustments can be changed' : null),
  prepare: partLinePrepare(stockAdjustmentLine, stockAdjustmentLine.stockAdjustmentId as never, false),
});

// =============================================================================
// Goods receipt: receive against an approved purchase order
// =============================================================================
export async function receiveGoods(ctx: EntityCtx, poId: number, input: z.output<typeof ReceiveBody>) {
  const po = await purchaseOrders.findVisible(ctx, poId, { lock: true });
  const target = { dealershipId: po.dealershipId as number, branchId: po.branchId as number };
  if (!ctx.access.canIn(P.receiptsCreate, target)) throw forbidden();
  if (!['approved', 'partially_received'].includes(po.status as string)) throw conflict('Goods can only be received against an approved purchase order');
  const receivedDate = input.receivedDate ?? today();
  if (receivedDate > today()) throw validationError([{ in: 'body', path: 'receivedDate', message: 'Cannot be in the future' }]);

  const ids = input.lines.map((l) => l.lineId);
  if (new Set(ids).size !== ids.length) throw validationError([{ in: 'body', path: 'lines', message: 'Each PO line once' }]);
  await query(
    ctx.tx,
    sql`select 1 from ${purchaseOrderLine} where ${and(eq(purchaseOrderLine.purchaseOrderId, poId), inArray(purchaseOrderLine.id, ids))!} for update`,
  );
  const poLines = await ctx.tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: poId, id: { in: ids } } });
  const byId = new Map(poLines.map((l) => [l.id, l]));
  for (const [i, l] of input.lines.entries()) {
    const pl = byId.get(l.lineId);
    if (!pl) throw validationError([{ in: 'body', path: `lines.${i}.lineId`, message: 'Not a line of this purchase order' }]);
    const { ok } = await numeric<{ ok: string }>(ctx, sql`select (${l.quantity}::numeric <= ${pl.quantity}::numeric - ${pl.receivedQty}::numeric)::text as ok`);
    if (ok !== 'true') {
      throw validationError([{ in: 'body', path: `lines.${i}.quantity`, message: `Only ${Number(pl.quantity) - Number(pl.receivedQty)} of ${pl.partNo} remain to be received` }]);
    }
  }

  const grnNo = await nextDocumentNumber(ctx.tx, target.dealershipId, DocType.goodsReceipt);
  const amounts = input.lines.map((l) => lineAmount(byId.get(l.lineId)!.unitPrice, l.quantity));
  const totalCost = await sumValues(ctx, amounts);
  const grn = await ctx.tx.goodsReceipt.create({
    data: {
      ...target,
      grnNo,
      purchaseOrderId: poId,
      supplierId: po.supplierId as number,
      supplierInvoiceNo: input.supplierInvoiceNo ?? null,
      receivedDate,
      totalCost,
      notes: input.notes ?? null,
      receivedById: ctx.access.userId,
    },
  });
  await ctx.tx.goodsReceiptLine.createMany({
    data: input.lines.map((l, i) => {
      const pl = byId.get(l.lineId)!;
      return { dealershipId: target.dealershipId, goodsReceiptId: grn!.id, purchaseOrderLineId: pl.id, partId: pl.partId, quantity: l.quantity, unitCost: pl.unitPrice, amount: amounts[i]! };
    }),
  });
  await moveStockLines(
    ctx,
    input.lines.map((l) => {
      const pl = byId.get(l.lineId)!;
      return { ...target, partId: pl.partId, type: 'receipt' as const, quantity: l.quantity, unitCost: pl.unitPrice, referenceType: 'goods_receipt', referenceId: grn!.id, referenceNo: grnNo };
    }),
  );
  for (const l of input.lines) {
    // Atomic: received_qty = received_qty + quantity.
    await ctx.tx.purchaseOrderLine.update({ where: { id: l.lineId }, data: { receivedQty: { increment: l.quantity } } });
  }
  const [{ open } = { open: 0 }] = await query<{ open: number }>(
    ctx.tx,
    sql`select count(*)::int as open from ${purchaseOrderLine}
         where ${and(eq(purchaseOrderLine.purchaseOrderId, poId), lt(purchaseOrderLine.receivedQty, purchaseOrderLine.quantity))!}`,
  );
  await purchaseOrders.transition(ctx, poId, open ? 'receive' : 'complete_receipt', `Goods receipt ${grnNo}`, { system: true });
  await ctx.audit({ entityType: 'parts.goods_receipt', entityId: grn!.id, action: 'create', ...target, changes: { purchaseOrderId: poId, totalCost, lines: input.lines } });
  await publish(ctx, {
    type: 'goods.received',
    dealershipId: target.dealershipId,
    aggregateType: 'parts.goods_receipt',
    aggregateId: grn!.id,
    payload: { goodsReceiptId: grn!.id, purchaseOrderId: poId, supplierId: po.supplierId as number, branchId: target.branchId, totalCost },
  });
  return goodsReceipts.get(ctx, grn!.id);
}

export async function goodsReceiptLines(ctx: EntityCtx, grnId: number) {
  await goodsReceipts.findVisible(ctx, grnId);
  return query<{
    id: number; purchaseOrderLineId: number; partId: number; partNo: string; description: string;
    quantity: string; unitCost: string; amount: string;
  }>(
    ctx.tx,
    sql`select ${goodsReceiptLine.id} as "id", ${goodsReceiptLine.purchaseOrderLineId} as "purchaseOrderLineId",
               ${goodsReceiptLine.partId} as "partId", ${part.partNo} as "partNo", ${part.description} as "description",
               ${goodsReceiptLine.quantity}::text as "quantity", ${goodsReceiptLine.unitCost}::text as "unitCost",
               ${goodsReceiptLine.amount}::text as "amount"
          from ${goodsReceiptLine}
          inner join ${part} on ${part.id} = ${goodsReceiptLine.partId}
         where ${goodsReceiptLine.goodsReceiptId} = ${grnId}
         order by ${goodsReceiptLine.id} asc
         limit 200`,
  );
}

// =============================================================================
// Stock ledger (append-only), read within the caller's stock scope
// =============================================================================
export async function listMovements(ctx: EntityCtx, q: PageQuery, f: z.output<typeof StockMovementQuery>) {
  const conds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: inventoryTransaction.dealershipId, branch: inventoryTransaction.branchId })];
  if (f.branchId) conds.push(eq(inventoryTransaction.branchId, f.branchId));
  if (f.partId) conds.push(eq(inventoryTransaction.partId, f.partId));
  if (f.type) conds.push(eq(inventoryTransaction.type, f.type));
  if (f.referenceType) conds.push(eq(inventoryTransaction.referenceType, f.referenceType));
  if (f.referenceId) conds.push(eq(inventoryTransaction.referenceId, f.referenceId));
  if (f.from) conds.push(gte(inventoryTransaction.occurredAt, new Date(`${f.from}T00:00:00`)));
  if (f.to) conds.push(lt(inventoryTransaction.occurredAt, new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000)));
  const where = and(...conds);
  const items = await query<{
    id: number; occurredAt: Date; branchId: number; partId: number; partNo: string; type: string;
    quantity: string; unitCost: string; value: string; balanceAfter: string; averageCostAfter: string;
    referenceType: string; referenceId: number; referenceNo: string | null; notes: string | null; actorName: string | null;
  }>(
    ctx.tx,
    sql`select ${inventoryTransaction.id} as "id", ${inventoryTransaction.occurredAt} as "occurredAt",
               ${inventoryTransaction.branchId} as "branchId", ${inventoryTransaction.partId} as "partId", ${part.partNo} as "partNo",
               ${inventoryTransaction.type} as "type", ${inventoryTransaction.quantity}::text as "quantity",
               ${inventoryTransaction.unitCost}::text as "unitCost", ${inventoryTransaction.value}::text as "value",
               ${inventoryTransaction.balanceAfter}::text as "balanceAfter", ${inventoryTransaction.averageCostAfter}::text as "averageCostAfter",
               ${inventoryTransaction.referenceType} as "referenceType", ${inventoryTransaction.referenceId} as "referenceId",
               ${inventoryTransaction.referenceNo} as "referenceNo", ${inventoryTransaction.notes} as "notes", ${user.fullName} as "actorName"
          from ${inventoryTransaction}
          inner join ${part} on ${part.id} = ${inventoryTransaction.partId}
          left join ${user} on ${user.id} = ${inventoryTransaction.actorId}
         where ${where!}
         order by ${inventoryTransaction.occurredAt} desc, ${inventoryTransaction.id} desc
         limit ${q.pageSize} offset ${offsetOf(q)}`,
  );
  const [{ total } = { total: 0 }] = await query<{ total: number }>(
    ctx.tx,
    sql`select count(*)::int as total from ${inventoryTransaction} where ${where!}`,
  );
  return { items, total, page: q.page, pageSize: q.pageSize };
}

// =============================================================================
// Parts requests: workshop asks, parts desk issues onto the job card
// =============================================================================
export async function createPartsRequest(ctx: EntityCtx, input: z.output<typeof PartsRequestCreate>) {
  const jc = await jobCards.findVisible(ctx, input.jobCardId);
  const target = { dealershipId: jc.dealershipId as number, branchId: input.branchId };
  if (!ctx.access.canIn(P.requestsCreate, { dealershipId: target.dealershipId, branchId: (jc.branchId as number | null) ?? null })) throw forbidden();
  if (!['open', 'in_progress'].includes(jc.status as string)) throw conflict(`This job card is ${jc.status}`);
  const [b] = await query<{ dealership_id: number }>(ctx.tx, sql`select dealership_id::int from core.branch where id = ${input.branchId}`);
  if (!b || b.dealership_id !== target.dealershipId) throw validationError([{ in: 'body', path: 'branchId', message: 'Choose a store branch of this dealership' }]);

  const resolved = [];
  for (const [i, l] of input.lines.entries()) resolved.push({ ...l, part: await resolvePart(ctx, l.partNo, `lines.${i}.partNo`) });
  if (new Set(resolved.map((r) => r.part.id)).size !== resolved.length) {
    throw validationError([{ in: 'body', path: 'lines', message: 'Each part once per request' }]);
  }
  const req = await ctx.tx.partsRequest.create({
    data: {
      ...target,
      requestNo: await nextDocumentNumber(ctx.tx, target.dealershipId, DocType.partsRequest),
      jobCardId: jc.id,
      requestedById: ctx.access.userId,
      notes: input.notes ?? null,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    },
  });
  await ctx.tx.partsRequestLine.createMany({
    data: resolved.map((r) => ({ dealershipId: target.dealershipId, partsRequestId: req!.id, partId: r.part.id, partNo: r.part.partNo, description: r.part.description, quantity: r.quantity })),
  });
  await ctx.audit({ entityType: 'parts.parts_request', entityId: req!.id, action: 'create', ...target, changes: input });
  return partsRequests.get(ctx, req!.id);
}

/** Request lines with the store's on-hand quantity, for the parts desk. */
export async function partsRequestLines(ctx: EntityCtx, requestId: number) {
  const req = await partsRequests.findVisible(ctx, requestId);
  return query<{
    id: number; partId: number; partNo: string; description: string;
    quantity: string; issuedQty: string; returnedQty: string; onHand: string | null;
  }>(
    ctx.tx,
    sql`select ${partsRequestLine.id} as "id", ${partsRequestLine.partId} as "partId", ${partsRequestLine.partNo} as "partNo",
               ${partsRequestLine.description} as "description", ${partsRequestLine.quantity}::text as "quantity",
               ${partsRequestLine.issuedQty}::text as "issuedQty", ${partsRequestLine.returnedQty}::text as "returnedQty",
               ${stockItem.quantityOnHand}::text as "onHand"
          from ${partsRequestLine}
          left join ${stockItem} on ${stockItem.partId} = ${partsRequestLine.partId} and ${stockItem.branchId} = ${req.branchId as number}
         where ${partsRequestLine.partsRequestId} = ${requestId}
         order by ${partsRequestLine.id} asc
         limit 50`,
  );
}

async function requestForIssue(ctx: EntityCtx, requestId: number) {
  const req = await partsRequests.findVisible(ctx, requestId, { lock: true });
  if (!partsRequests.canOnRow(ctx.access, req, P.issuesCreate)) throw forbidden();
  // The job card is authorised through the request (the parts desk need not see the workshop).
  const jc = await jobCards.findById(ctx, req.jobCardId as number, { lock: true });
  if (!['open', 'in_progress'].includes(jc.status as string)) throw conflict(`The job card is ${jc.status}`);
  return { req, jc };
}

async function linesFor(ctx: EntityCtx, requestId: number, lineIds: number[]) {
  if (new Set(lineIds).size !== lineIds.length) throw validationError([{ in: 'body', path: 'lines', message: 'Each line once' }]);
  await query(
    ctx.tx,
    sql`select 1 from ${partsRequestLine} where ${and(eq(partsRequestLine.partsRequestId, requestId), inArray(partsRequestLine.id, lineIds))!} for update`,
  );
  const rows = await ctx.tx.partsRequestLine.findMany({ where: { partsRequestId: requestId, id: { in: lineIds } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  lineIds.forEach((id, i) => {
    if (!byId.has(id)) throw validationError([{ in: 'body', path: `lines.${i}.lineId`, message: 'Not a line of this request' }]);
  });
  return byId;
}

/** Issue: stock out at average cost, the parts appear on the job card at the selling price. */
export async function issueParts(ctx: EntityCtx, requestId: number, input: z.output<typeof IssueBody>) {
  const { req, jc } = await requestForIssue(ctx, requestId);
  if (!['open', 'partially_issued'].includes(req.status as string)) throw conflict(`This request is ${req.status}`);
  const byId = await linesFor(ctx, requestId, input.lines.map((l) => l.lineId));
  for (const [i, l] of input.lines.entries()) {
    const rl = byId.get(l.lineId)!;
    const { ok } = await numeric<{ ok: string }>(ctx, sql`select (${l.quantity}::numeric <= ${rl.quantity}::numeric - ${rl.issuedQty}::numeric)::text as ok`);
    if (ok !== 'true') throw validationError([{ in: 'body', path: `lines.${i}.quantity`, message: `Only ${Number(rl.quantity) - Number(rl.issuedQty)} of ${rl.partNo} remain to be issued` }]);
  }

  const results = await moveStockLines(
    ctx,
    input.lines.map((l) => ({
      dealershipId: req.dealershipId as number,
      branchId: req.branchId as number,
      partId: byId.get(l.lineId)!.partId,
      type: 'issue' as const,
      quantity: `-${l.quantity}`,
      referenceType: 'parts_request',
      referenceId: req.id,
      referenceNo: req.requestNo as string,
      notes: `Job card ${jc.jobCardNo as string}`,
    })),
  );

  for (const l of input.lines) {
    const rl = byId.get(l.lineId)!;
    const p = await ctx.tx.part.findFirst({ where: { id: rl.partId }, select: { sellingPrice: true } });
    const { issued } = await numeric<{ issued: string }>(ctx, sql`select (${rl.issuedQty}::numeric + ${l.quantity}::numeric - ${rl.returnedQty}::numeric)::text as issued`);
    let jobCardLineId = rl.jobCardLineId;
    if (jobCardLineId) {
      await ctx.tx.jobCardLine.updateMany({
        where: { id: jobCardLineId },
        data: { quantity: issued, amount: lineAmount(p!.sellingPrice, issued) },
      });
    } else {
      const created = await ctx.tx.jobCardLine.create({
        data: {
          dealershipId: jc.dealershipId as number,
          jobCardId: jc.id,
          kind: 'part',
          description: rl.description,
          partNo: rl.partNo,
          quantity: issued,
          unitPrice: p!.sellingPrice,
          amount: lineAmount(p!.sellingPrice, issued),
          source: 'parts',
          status: 'done',
          doneById: ctx.access.userId,
          doneAt: new Date(),
        },
        select: { id: true },
      });
      jobCardLineId = created!.id;
    }
    // Atomic: issued_qty = issued_qty + quantity.
    await ctx.tx.partsRequestLine.update({ where: { id: rl.id }, data: { issuedQty: { increment: l.quantity }, jobCardLineId } });
  }

  const [{ pending } = { pending: 0 }] = await query<{ pending: number }>(
    ctx.tx,
    sql`select count(*)::int as pending from ${partsRequestLine}
         where ${and(eq(partsRequestLine.partsRequestId, requestId), lt(partsRequestLine.issuedQty, partsRequestLine.quantity))!}`,
  );
  await partsRequests.transition(ctx, requestId, pending ? 'issue_partial' : 'issue_full', undefined, { system: true });
  await publish(ctx, {
    type: 'stock.moved',
    dealershipId: req.dealershipId as number,
    aggregateType: 'parts.parts_request',
    aggregateId: req.id,
    payload: { kind: 'issue', referenceType: 'parts_request', referenceId: req.id, branchId: req.branchId as number, value: await sumValues(ctx, results.map((r) => r.value)) },
  });
  await ctx.audit({ entityType: 'parts.parts_request', entityId: req.id, action: 'issue', dealershipId: req.dealershipId as number, branchId: req.branchId as number, changes: input });
  return partsRequestLines(ctx, requestId);
}

/** Return unused parts from the job card to the store, at the cost they were issued at. */
export async function returnParts(ctx: EntityCtx, requestId: number, input: z.output<typeof IssueBody>) {
  const { req } = await requestForIssue(ctx, requestId);
  const byId = await linesFor(ctx, requestId, input.lines.map((l) => l.lineId));
  const costs: string[] = [];
  for (const [i, l] of input.lines.entries()) {
    const rl = byId.get(l.lineId)!;
    const { ok } = await numeric<{ ok: string }>(ctx, sql`select (${l.quantity}::numeric <= ${rl.issuedQty}::numeric - ${rl.returnedQty}::numeric)::text as ok`);
    if (ok !== 'true') throw validationError([{ in: 'body', path: `lines.${i}.quantity`, message: `Only ${Number(rl.issuedQty) - Number(rl.returnedQty)} of ${rl.partNo} can be returned` }]);
    // Cost of the most recent issue of this part on this request.
    const issue = await ctx.tx.inventoryTransaction.findFirst({
      where: { referenceType: 'parts_request', referenceId: req.id, partId: rl.partId, type: 'issue' },
      select: { unitCost: true },
      orderBy: { id: 'desc' },
    });
    costs.push(issue!.unitCost);
  }

  const results = await moveStockLines(
    ctx,
    input.lines.map((l, i) => ({
      dealershipId: req.dealershipId as number,
      branchId: req.branchId as number,
      partId: byId.get(l.lineId)!.partId,
      type: 'return' as const,
      quantity: l.quantity,
      unitCost: costs[i]!,
      referenceType: 'parts_request',
      referenceId: req.id,
      referenceNo: req.requestNo as string,
    })),
  );

  for (const l of input.lines) {
    const rl = byId.get(l.lineId)!;
    const { net } = await numeric<{ net: string }>(ctx, sql`select (${rl.issuedQty}::numeric - ${rl.returnedQty}::numeric - ${l.quantity}::numeric)::text as net`);
    // Atomic: returned_qty = returned_qty + quantity.
    await ctx.tx.partsRequestLine.update({ where: { id: rl.id }, data: { returnedQty: { increment: l.quantity } } });
    if (rl.jobCardLineId) {
      if (Number(net) === 0) {
        await ctx.tx.partsRequestLine.update({ where: { id: rl.id }, data: { jobCardLineId: null } });
        await ctx.tx.jobCardLine.deleteMany({ where: { id: rl.jobCardLineId } });
      } else {
        const line = await ctx.tx.jobCardLine.findFirst({ where: { id: rl.jobCardLineId }, select: { unitPrice: true } });
        await ctx.tx.jobCardLine.updateMany({ where: { id: rl.jobCardLineId }, data: { quantity: net, amount: lineAmount(line!.unitPrice, net) } });
      }
    }
  }
  await publish(ctx, {
    type: 'stock.moved',
    dealershipId: req.dealershipId as number,
    aggregateType: 'parts.parts_request',
    aggregateId: req.id,
    payload: { kind: 'return', referenceType: 'parts_request', referenceId: req.id, branchId: req.branchId as number, value: await sumValues(ctx, results.map((r) => r.value)) },
  });
  await ctx.audit({ entityType: 'parts.parts_request', entityId: req.id, action: 'return', dealershipId: req.dealershipId as number, branchId: req.branchId as number, changes: input });
  return partsRequestLines(ctx, requestId);
}

// =============================================================================
// Store desk: stock in from head office, stock out against a repair order / job card, reports
// =============================================================================
const karachiDate = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

/** Each part number once, resolved against the catalogue. */
export async function resolveLines<T extends { partNo: string }>(ctx: EntityCtx, lines: T[]) {
  const seen = new Set<string>();
  const out: (T & { part: Awaited<ReturnType<typeof resolvePart>> })[] = [];
  for (const [i, l] of lines.entries()) {
    const p = await resolvePart(ctx, l.partNo, `lines.${i}.partNo`);
    if (seen.has(p.partNo)) throw validationError([{ in: 'body', path: `lines.${i}.partNo`, message: `${p.partNo} is on the list twice: add the quantities together` }]);
    seen.add(p.partNo);
    out.push({ ...l, part: p });
  }
  return out;
}

export async function assertBranch(ctx: EntityCtx, dealershipId: number, branchId: number) {
  const b = await ctx.tx.branch.findFirst({ where: { id: branchId }, select: { dealershipId: true } });
  if (!b || b.dealershipId !== dealershipId) throw validationError([{ in: 'body', path: 'branchId', message: 'Choose a branch of this dealership' }]);
}

/** Parts received from head office (a challan / invoice): priced per line, posted to stock. No purchase order needed. */
export async function receiveDirect(ctx: EntityCtx, input: z.output<typeof DirectReceiveBody>) {
  const target = { dealershipId: input.dealershipId, branchId: input.branchId };
  if (!ctx.access.canIn(P.receiptsCreate, target)) throw forbidden();
  const receivedDate = input.receivedDate ?? karachiDate();
  if (receivedDate > karachiDate()) throw validationError([{ in: 'body', path: 'receivedDate', message: 'Cannot be in the future' }]);
  await assertBranch(ctx, input.dealershipId, input.branchId);
  const sup = await ctx.tx.supplier.findFirst({ where: { id: input.supplierId, dealershipId: input.dealershipId, isActive: true }, select: { id: true } });
  if (!sup) throw validationError([{ in: 'body', path: 'supplierId', message: 'Choose a supplier of this dealership' }]);
  const lines = await resolveLines(ctx, input.lines);

  const grnNo = await nextDocumentNumber(ctx.tx, target.dealershipId, DocType.goodsReceipt);
  const amounts = lines.map((l) => lineAmount(l.unitCost, l.quantity));
  const totalCost = await sumValues(ctx, amounts);
  const grn = await ctx.tx.goodsReceipt.create({
    data: { ...target, grnNo, purchaseOrderId: null, supplierId: input.supplierId, supplierInvoiceNo: input.supplierInvoiceNo ?? null, receivedDate, totalCost, notes: input.notes ?? null, receivedById: ctx.access.userId },
  });
  await ctx.tx.goodsReceiptLine.createMany({
    data: lines.map((l, i) => ({ dealershipId: target.dealershipId, goodsReceiptId: grn!.id, purchaseOrderLineId: null, partId: l.part.id, quantity: l.quantity, unitCost: l.unitCost, amount: amounts[i]! })),
  });
  await moveStockLines(
    ctx,
    lines.map((l) => ({ ...target, partId: l.part.id, type: 'receipt' as const, quantity: l.quantity, unitCost: l.unitCost, referenceType: 'goods_receipt', referenceId: grn!.id, referenceNo: grnNo })),
  );
  // The price received from the company is the latest price paid.
  for (const l of lines) await ctx.tx.part.update({ where: { id: l.part.id }, data: { purchasePrice: l.unitCost } });
  await ctx.audit({ entityType: 'parts.goods_receipt', entityId: grn!.id, action: 'create', ...target, changes: { direct: true, totalCost, lines: input.lines } });
  await publish(ctx, {
    type: 'goods.received',
    dealershipId: target.dealershipId,
    aggregateType: 'parts.goods_receipt',
    aggregateId: grn!.id,
    payload: { goodsReceiptId: grn!.id, purchaseOrderId: null, supplierId: input.supplierId, branchId: target.branchId, totalCost },
  });
  return goodsReceipts.get(ctx, grn!.id);
}

/** A price list pasted from Excel: new parts added, known ones updated. */
export async function importParts(ctx: EntityCtx, input: z.output<typeof PartImportBody>) {
  if (!ctx.access.hasGlobal(P.catalogManage)) throw forbidden();
  const rows = new Map(input.rows.map((r) => [normalizePartNo(r.partNo), r]));
  const existing = new Map((await ctx.tx.part.findMany({ where: { partNo: { in: [...rows.keys()] } } })).map((p) => [p.partNo, p]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const fresh: { partNo: string; description: string; brand: string; category: string | null; sellingPrice: string; createdById: number; updatedById: number }[] = [];
  for (const [partNo, r] of rows) {
    const p = existing.get(partNo);
    if (!p) {
      fresh.push({ partNo, description: r.description, brand: input.brand, category: r.category ?? null, sellingPrice: r.sellingPrice, createdById: ctx.access.userId, updatedById: ctx.access.userId });
      added++;
      continue;
    }
    const { same } = await numeric<{ same: string }>(ctx, sql`select (${p.sellingPrice.toString()}::numeric = ${r.sellingPrice}::numeric)::text as same`);
    if (p.description === r.description && same === 'true' && p.isActive) unchanged++;
    else {
      await ctx.tx.part.update({ where: { id: p.id }, data: { description: r.description, sellingPrice: r.sellingPrice, isActive: true, ...(r.category ? { category: r.category } : {}), updatedById: ctx.access.userId } });
      updated++;
    }
  }
  for (let i = 0; i < fresh.length; i += 500) await ctx.tx.part.createMany({ data: fresh.slice(i, i + 500) });
  await ctx.audit({ entityType: 'parts.part', entityId: 0, action: 'import', dealershipId: null, branchId: null, changes: { brand: input.brand, added, updated, unchanged } });
  return { added, updated, unchanged };
}

const moneyOf = (expr: SQL) => sql`coalesce(${expr}, 0)::numeric(14, 2)::text`;

/** Parts in and out per month: at cost, at the price charged (revenue) and the margin; by category over the same months. */
export async function monthlyReport(ctx: EntityCtx, f: z.output<typeof MonthlyReportQuery>) {
  const conds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: inventoryTransaction.dealershipId, branch: inventoryTransaction.branchId })];
  if (f.dealershipId) conds.push(eq(inventoryTransaction.dealershipId, f.dealershipId));
  if (f.branchId) conds.push(eq(inventoryTransaction.branchId, f.branchId));
  const to = f.to ?? karachiDate().slice(0, 7);
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  const from = f.from ?? new Date(Date.UTC(ty, tm - 1 - 5, 1)).toISOString().slice(0, 7);
  const day = sql`(${inventoryTransaction.occurredAt} at time zone 'Asia/Karachi')`;
  conds.push(sql`to_char(${day}, 'YYYY-MM') >= ${from} and to_char(${day}, 'YYYY-MM') <= ${to}`);
  const where = and(...conds)!;
  // What the customer paid: the price charged less the discount given.
  const price = sql`(coalesce(${inventoryTransaction.unitPrice}, ${part.sellingPrice}) * (1 - coalesce(${inventoryTransaction.discountPercent}, 0) / 100))`;
  const figures = sql`
    ${moneyOf(sql`sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} = 'receipt')`)} as "receivedCost",
    ${moneyOf(sql`-sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} = 'issue')`)} as "issuedCost",
    ${moneyOf(sql`-sum(${inventoryTransaction.quantity} * ${price}) filter (where ${inventoryTransaction.type} = 'issue')`)} as "issuedSales",
    ${moneyOf(sql`sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} = 'return')`)} as "returnedCost",
    ${moneyOf(sql`sum(${inventoryTransaction.quantity} * ${price}) filter (where ${inventoryTransaction.type} = 'return')`)} as "returnedSales",
    ${moneyOf(sql`sum(${inventoryTransaction.value}) filter (where ${inventoryTransaction.type} = 'adjustment')`)} as "adjustmentCost"`;
  type Fig = { receivedCost: string; issuedCost: string; issuedSales: string; returnedCost: string; returnedSales: string; adjustmentCost: string };
  const withNet = async (r: Fig) => {
    const [n] = await query<{ netCost: string; netSales: string; margin: string }>(
      ctx.tx,
      sql`select (${r.issuedCost}::numeric - ${r.returnedCost}::numeric)::numeric(14,2)::text as "netCost",
                 (${r.issuedSales}::numeric - ${r.returnedSales}::numeric)::numeric(14,2)::text as "netSales",
                 ((${r.issuedSales}::numeric - ${r.returnedSales}::numeric) - (${r.issuedCost}::numeric - ${r.returnedCost}::numeric))::numeric(14,2)::text as "margin"`,
    );
    return { ...r, ...n! };
  };
  const base = sql`from ${inventoryTransaction} inner join ${part} on ${part.id} = ${inventoryTransaction.partId} where ${where}`;
  const months = await query<Fig & { month: string }>(ctx.tx, sql`select to_char(${day}, 'YYYY-MM') as "month", ${figures} ${base} group by 1 order by 1 desc`);
  const [t] = await query<Fig>(ctx.tx, sql`select ${figures} ${base}`);
  const cats = await query<Fig & { category: string }>(ctx.tx, sql`select coalesce(${part.category}, 'Uncategorised') as "category", ${figures} ${base} group by 1 order by 1`);
  return {
    months: await Promise.all(months.map(async (r) => ({ month: r.month, ...(await withNet(r)) }))),
    categories: await Promise.all(
      cats.map(async (r) => {
        const n = await withNet(r);
        return { category: r.category, receivedCost: r.receivedCost, netCost: n.netCost, netSales: n.netSales };
      }),
    ),
    totals: await withNet(t!),
  };
}

/** What is in the store now, one row per part and branch (for the stock sheet download). */
export async function stockSheet(ctx: EntityCtx, q: z.output<typeof StockSheetQuery>) {
  const conds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: stockItem.dealershipId, branch: stockItem.branchId })];
  if (q.dealershipId) conds.push(eq(stockItem.dealershipId, q.dealershipId));
  if (q.branchId) conds.push(eq(stockItem.branchId, q.branchId));
  if (!q.includeZero) conds.push(sql`${stockItem.quantityOnHand} > 0`);
  return query<{ branchName: string; partNo: string; description: string; category: string | null; quantityOnHand: string; averageCost: string; stockValue: string; sellingPrice: string; saleValue: string; binLocation: string | null; reorderLevel: string }>(
    ctx.tx,
    sql`select ${branchTable.name} as "branchName", ${part.partNo} as "partNo", ${part.description} as "description", ${part.category} as "category",
               ${stockItem.quantityOnHand}::text as "quantityOnHand", ${stockItem.averageCost}::text as "averageCost",
               round(${stockItem.quantityOnHand} * ${stockItem.averageCost}, 2)::text as "stockValue", ${part.sellingPrice}::text as "sellingPrice",
               round(${stockItem.quantityOnHand} * ${part.sellingPrice}, 2)::text as "saleValue",
               ${stockItem.binLocation} as "binLocation", ${stockItem.reorderLevel}::text as "reorderLevel"
          from ${stockItem}
          inner join ${part} on ${part.id} = ${stockItem.partId}
          inner join ${branchTable} on ${branchTable.id} = ${stockItem.branchId}
         where ${and(...conds)!}
         order by ${branchTable.name}, ${part.partNo}
         limit 6000`,
  );
}
