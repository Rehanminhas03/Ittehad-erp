import { type SQL, and, asc, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { scopeWhere } from '../../auth/access';
import { LineService } from '../../entity/lines';
import type { EntityCtx, Row } from '../../entity/types';
import { publish } from '../../events/bus';
import { conflict, forbidden, validationError } from '../../lib/errors';
import { lineAmount } from '../../lib/money';
import { type PageQuery, offsetOf } from '../../lib/pagination';
import type { z } from '../../lib/zod';
import { DocType, nextDocumentNumber } from '../core/documents';
import { user } from '../core/models';
import { jobCards } from '../service/entities';
import { jobCardLine } from '../service/models';
import {
  adjustments,
  assertPartNotOnDocument,
  goodsReceipts,
  partsRequests,
  purchaseOrders,
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
  type IssueBody,
  type PartsRequestCreate,
  type ReceiveBody,
  type StockMovementQuery,
} from './schemas';
import { moveStockLines, sumValues } from './stock';

const today = () => new Date().toISOString().slice(0, 10);
/** Decimal comparison/arithmetic in Postgres numeric (exact). */
async function numeric<T extends Record<string, string>>(ctx: EntityCtx, query: SQL): Promise<T> {
  const { rows } = await ctx.tx.execute(query);
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
  await ctx.tx.execute(
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
  const poLines = await ctx.tx
    .select()
    .from(purchaseOrderLine)
    .where(and(eq(purchaseOrderLine.purchaseOrderId, poId), inArray(purchaseOrderLine.id, ids)))
    .for('update');
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
  const [grn] = await ctx.tx
    .insert(goodsReceipt)
    .values({
      ...target,
      grnNo,
      purchaseOrderId: poId,
      supplierId: po.supplierId as number,
      supplierInvoiceNo: input.supplierInvoiceNo ?? null,
      receivedDate,
      totalCost,
      notes: input.notes ?? null,
      receivedById: ctx.access.userId,
    })
    .returning();
  await ctx.tx.insert(goodsReceiptLine).values(
    input.lines.map((l, i) => {
      const pl = byId.get(l.lineId)!;
      return { dealershipId: target.dealershipId, goodsReceiptId: grn!.id, purchaseOrderLineId: pl.id, partId: pl.partId, quantity: l.quantity, unitCost: pl.unitPrice, amount: amounts[i]! };
    }),
  );
  await moveStockLines(
    ctx,
    input.lines.map((l) => {
      const pl = byId.get(l.lineId)!;
      return { ...target, partId: pl.partId, type: 'receipt' as const, quantity: l.quantity, unitCost: pl.unitPrice, referenceType: 'goods_receipt', referenceId: grn!.id, referenceNo: grnNo };
    }),
  );
  for (const l of input.lines) {
    await ctx.tx
      .update(purchaseOrderLine)
      .set({ receivedQty: sql`${purchaseOrderLine.receivedQty} + ${l.quantity}::numeric` })
      .where(eq(purchaseOrderLine.id, l.lineId));
  }
  const [{ open } = { open: 0 }] = await ctx.tx
    .select({ open: count() })
    .from(purchaseOrderLine)
    .where(and(eq(purchaseOrderLine.purchaseOrderId, poId), lt(purchaseOrderLine.receivedQty, purchaseOrderLine.quantity)));
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
  return ctx.tx
    .select({
      id: goodsReceiptLine.id,
      purchaseOrderLineId: goodsReceiptLine.purchaseOrderLineId,
      partId: goodsReceiptLine.partId,
      partNo: part.partNo,
      description: part.description,
      quantity: goodsReceiptLine.quantity,
      unitCost: goodsReceiptLine.unitCost,
      amount: goodsReceiptLine.amount,
    })
    .from(goodsReceiptLine)
    .innerJoin(part, eq(part.id, goodsReceiptLine.partId))
    .where(eq(goodsReceiptLine.goodsReceiptId, grnId))
    .orderBy(asc(goodsReceiptLine.id))
    .limit(200);
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
  const items = await ctx.tx
    .select({
      id: inventoryTransaction.id,
      occurredAt: inventoryTransaction.occurredAt,
      branchId: inventoryTransaction.branchId,
      partId: inventoryTransaction.partId,
      partNo: part.partNo,
      type: inventoryTransaction.type,
      quantity: inventoryTransaction.quantity,
      unitCost: inventoryTransaction.unitCost,
      value: inventoryTransaction.value,
      balanceAfter: inventoryTransaction.balanceAfter,
      averageCostAfter: inventoryTransaction.averageCostAfter,
      referenceType: inventoryTransaction.referenceType,
      referenceId: inventoryTransaction.referenceId,
      referenceNo: inventoryTransaction.referenceNo,
      notes: inventoryTransaction.notes,
      actorName: user.fullName,
    })
    .from(inventoryTransaction)
    .innerJoin(part, eq(part.id, inventoryTransaction.partId))
    .leftJoin(user, eq(user.id, inventoryTransaction.actorId))
    .where(where)
    .orderBy(desc(inventoryTransaction.occurredAt), desc(inventoryTransaction.id))
    .limit(q.pageSize)
    .offset(offsetOf(q));
  const [{ total } = { total: 0 }] = await ctx.tx.select({ total: count() }).from(inventoryTransaction).where(where);
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
  const [b] = await ctx.tx.execute<{ dealership_id: number }>(sql`select dealership_id::int from core.branch where id = ${input.branchId}`).then((r) => r.rows);
  if (!b || b.dealership_id !== target.dealershipId) throw validationError([{ in: 'body', path: 'branchId', message: 'Choose a store branch of this dealership' }]);

  const resolved = [];
  for (const [i, l] of input.lines.entries()) resolved.push({ ...l, part: await resolvePart(ctx, l.partNo, `lines.${i}.partNo`) });
  if (new Set(resolved.map((r) => r.part.id)).size !== resolved.length) {
    throw validationError([{ in: 'body', path: 'lines', message: 'Each part once per request' }]);
  }
  const [req] = await ctx.tx
    .insert(partsRequest)
    .values({
      ...target,
      requestNo: await nextDocumentNumber(ctx.tx, target.dealershipId, DocType.partsRequest),
      jobCardId: jc.id,
      requestedById: ctx.access.userId,
      notes: input.notes ?? null,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    })
    .returning();
  await ctx.tx.insert(partsRequestLine).values(
    resolved.map((r) => ({ dealershipId: target.dealershipId, partsRequestId: req!.id, partId: r.part.id, partNo: r.part.partNo, description: r.part.description, quantity: r.quantity })),
  );
  await ctx.audit({ entityType: 'parts.parts_request', entityId: req!.id, action: 'create', ...target, changes: input });
  return partsRequests.get(ctx, req!.id);
}

/** Request lines with the store's on-hand quantity, for the parts desk. */
export async function partsRequestLines(ctx: EntityCtx, requestId: number) {
  const req = await partsRequests.findVisible(ctx, requestId);
  return ctx.tx
    .select({
      id: partsRequestLine.id,
      partId: partsRequestLine.partId,
      partNo: partsRequestLine.partNo,
      description: partsRequestLine.description,
      quantity: partsRequestLine.quantity,
      issuedQty: partsRequestLine.issuedQty,
      returnedQty: partsRequestLine.returnedQty,
      onHand: stockItem.quantityOnHand,
    })
    .from(partsRequestLine)
    .leftJoin(stockItem, and(eq(stockItem.partId, partsRequestLine.partId), eq(stockItem.branchId, req.branchId as number)))
    .where(eq(partsRequestLine.partsRequestId, requestId))
    .orderBy(asc(partsRequestLine.id))
    .limit(50);
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
  const rows = await ctx.tx
    .select()
    .from(partsRequestLine)
    .where(and(eq(partsRequestLine.partsRequestId, requestId), inArray(partsRequestLine.id, lineIds)))
    .for('update');
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
    const [p] = await ctx.tx.select({ sellingPrice: part.sellingPrice }).from(part).where(eq(part.id, rl.partId));
    const { issued } = await numeric<{ issued: string }>(ctx, sql`select (${rl.issuedQty}::numeric + ${l.quantity}::numeric - ${rl.returnedQty}::numeric)::text as issued`);
    let jobCardLineId = rl.jobCardLineId;
    if (jobCardLineId) {
      await ctx.tx
        .update(jobCardLine)
        .set({ quantity: issued, amount: lineAmount(p!.sellingPrice, issued) })
        .where(eq(jobCardLine.id, jobCardLineId));
    } else {
      const [created] = await ctx.tx
        .insert(jobCardLine)
        .values({
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
        })
        .returning({ id: jobCardLine.id });
      jobCardLineId = created!.id;
    }
    await ctx.tx
      .update(partsRequestLine)
      .set({ issuedQty: sql`${partsRequestLine.issuedQty} + ${l.quantity}::numeric`, jobCardLineId })
      .where(eq(partsRequestLine.id, rl.id));
  }

  const [{ pending } = { pending: 0 }] = await ctx.tx
    .select({ pending: count() })
    .from(partsRequestLine)
    .where(and(eq(partsRequestLine.partsRequestId, requestId), lt(partsRequestLine.issuedQty, partsRequestLine.quantity)));
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
    const [issue] = await ctx.tx
      .select({ unitCost: inventoryTransaction.unitCost })
      .from(inventoryTransaction)
      .where(and(eq(inventoryTransaction.referenceType, 'parts_request'), eq(inventoryTransaction.referenceId, req.id), eq(inventoryTransaction.partId, rl.partId), eq(inventoryTransaction.type, 'issue')))
      .orderBy(desc(inventoryTransaction.id))
      .limit(1);
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
    await ctx.tx.update(partsRequestLine).set({ returnedQty: sql`${partsRequestLine.returnedQty} + ${l.quantity}::numeric` }).where(eq(partsRequestLine.id, rl.id));
    if (rl.jobCardLineId) {
      if (Number(net) === 0) {
        await ctx.tx.update(partsRequestLine).set({ jobCardLineId: null }).where(eq(partsRequestLine.id, rl.id));
        await ctx.tx.delete(jobCardLine).where(eq(jobCardLine.id, rl.jobCardLineId));
      } else {
        const [line] = await ctx.tx.select({ unitPrice: jobCardLine.unitPrice }).from(jobCardLine).where(eq(jobCardLine.id, rl.jobCardLineId));
        await ctx.tx.update(jobCardLine).set({ quantity: net, amount: lineAmount(line!.unitPrice, net) }).where(eq(jobCardLine.id, rl.jobCardLineId));
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
