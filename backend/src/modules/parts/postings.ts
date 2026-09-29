import type { EntityCtx, Row } from '../../entity/types';
import { publish } from '../../events/bus';
import { moveStockLines, sumValues } from './stock';

/** Transfer dispatched: stock leaves the source branch at average cost (recorded for the receiver). */
export async function dispatchTransfer(ctx: EntityCtx, t: Row) {
  const lines = await ctx.tx.stockTransferLine.findMany({ where: { stockTransferId: t.id }, orderBy: { id: 'asc' } });
  const results = await moveStockLines(
    ctx,
    lines.map((l) => ({
      dealershipId: t.dealershipId as number,
      branchId: t.branchId as number,
      partId: l.partId,
      type: 'transfer_out' as const,
      quantity: `-${l.quantity}`,
      referenceType: 'stock_transfer',
      referenceId: t.id,
      referenceNo: t.transferNo as string,
    })),
  );
  for (const [i, l] of lines.entries()) {
    await ctx.tx.stockTransferLine.update({ where: { id: l.id }, data: { unitCost: results[i]!.unitCost } });
  }
  await ctx.tx.stockTransfer.update({ where: { id: t.id }, data: { dispatchedAt: new Date() } });
}

/** Transfer received: the same quantities arrive at the destination at the dispatch cost. */
export async function receiveTransfer(ctx: EntityCtx, t: Row) {
  const lines = await ctx.tx.stockTransferLine.findMany({ where: { stockTransferId: t.id }, orderBy: { id: 'asc' } });
  await moveStockLines(
    ctx,
    lines.map((l) => ({
      dealershipId: t.dealershipId as number,
      branchId: t.toBranchId as number,
      partId: l.partId,
      type: 'transfer_in' as const,
      quantity: l.quantity,
      unitCost: l.unitCost,
      referenceType: 'stock_transfer',
      referenceId: t.id,
      referenceNo: t.transferNo as string,
    })),
  );
  await ctx.tx.stockTransfer.update({ where: { id: t.id }, data: { receivedAt: new Date() } });
}

/** Approved adjustment: each line moves stock (increases at the given cost or the current average). */
export async function postAdjustment(ctx: EntityCtx, a: Row) {
  const lines = await ctx.tx.stockAdjustmentLine.findMany({ where: { stockAdjustmentId: a.id }, orderBy: { id: 'asc' } });
  const results = await moveStockLines(
    ctx,
    lines.map((l) => ({
      dealershipId: a.dealershipId as number,
      branchId: a.branchId as number,
      partId: l.partId,
      type: 'adjustment' as const,
      quantity: l.quantity,
      unitCost: l.unitCost,
      referenceType: 'stock_adjustment',
      referenceId: a.id,
      referenceNo: a.adjustmentNo as string,
      notes: a.reason as string,
    })),
  );
  await ctx.tx.stockAdjustment.update({ where: { id: a.id }, data: { postedAt: new Date() } });
  await publish(ctx, {
    type: 'stock.moved',
    dealershipId: a.dealershipId as number,
    aggregateType: 'parts.stock_adjustment',
    aggregateId: a.id,
    payload: {
      kind: 'adjustment',
      referenceType: 'stock_adjustment',
      referenceId: a.id,
      branchId: a.branchId as number,
      value: await sumValues(ctx, results.map((r) => r.value)),
    },
  });
}
