import type { EntityCtx, Row } from '../../entity/types';
import { DocType, nextDocumentNumber } from '../core/documents';
import { normalizePartNo } from './entities';

/** Note on the request that is made by itself when the workshop adds parts to a job card. */
export const AUTO_REQUEST_NOTE = 'Added to the job card by the workshop';
const PART_KINDS = ['part', 'lubricant', 'accessory'];

/** The store a job card's parts come from: its own branch, else the dealership's main branch. */
async function storeBranchId(ctx: EntityCtx, dealershipId: number, branchId: number | null) {
  if (branchId) return branchId;
  const main = await ctx.tx.branch.findFirst({ where: { dealershipId, code: 'MAIN' }, select: { id: true } });
  return (main ?? (await ctx.tx.branch.findFirst({ where: { dealershipId }, orderBy: { id: 'asc' }, select: { id: true } })))?.id ?? null;
}

/**
 * When the workshop puts a part, lubricant or accessory on a job card, the store is asked for it by itself: the line goes
 * on one open request of that job card (made if there is none), linked to the job card line so that what the store
 * issues fills that line instead of adding a second one. Changing or removing the line changes or removes what is asked
 * for, as long as the store has not started giving it.
 */
export async function keepRequestInStep(ctx: EntityCtx, jobCard: Row, line: Row, change: 'add' | 'update' | 'remove') {
  if (!PART_KINDS.includes(line.kind as string) || line.source !== 'manual' || !line.partNo) return;
  const lineId = line.id as number;
  const linked = await ctx.tx.partsRequestLine.findFirst({ where: { jobCardLineId: lineId } });

  if (change === 'remove') {
    if (!linked || Number(linked.issuedQty) > 0) return;
    await ctx.tx.partsRequestLine.delete({ where: { id: linked.id } });
    const left = await ctx.tx.partsRequestLine.count({ where: { partsRequestId: linked.partsRequestId } });
    if (!left) await ctx.tx.partsRequest.update({ where: { id: linked.partsRequestId }, data: { status: 'cancelled', updatedById: ctx.access.userId } });
    return;
  }
  if (change === 'update') {
    if (linked && Number(linked.issuedQty) === 0) {
      await ctx.tx.partsRequestLine.update({ where: { id: linked.id }, data: { quantity: line.quantity as string, discountPercent: (line.discountPercent as string | undefined) ?? '0' } });
    }
    return;
  }

  // add: only parts that are in the catalogue can be asked for.
  const part = await ctx.tx.part.findFirst({ where: { partNo: normalizePartNo(line.partNo as string), isActive: true }, select: { id: true, partNo: true, description: true } });
  if (!part) return;
  const dealershipId = jobCard.dealershipId as number;
  const branchId = await storeBranchId(ctx, dealershipId, (jobCard.branchId as number | null) ?? null);
  if (!branchId) return;
  let request = await ctx.tx.partsRequest.findFirst({ where: { jobCardId: jobCard.id as number, kind: 'request', status: 'open', notes: AUTO_REQUEST_NOTE, branchId } });
  if (!request) {
    request = await ctx.tx.partsRequest.create({
      data: {
        dealershipId,
        branchId,
        requestNo: await nextDocumentNumber(ctx.tx, dealershipId, DocType.partsRequest),
        jobCardId: jobCard.id as number,
        requestedById: ctx.access.userId,
        notes: AUTO_REQUEST_NOTE,
        createdById: ctx.access.userId,
        updatedById: ctx.access.userId,
      },
    });
  }
  const sameParts = await ctx.tx.partsRequestLine.findFirst({ where: { partsRequestId: request!.id, partId: part.id } });
  // A part is once per request: a second line of the same part joins the first one's quantity.
  if (sameParts) return;
  await ctx.tx.partsRequestLine.create({
    data: {
      dealershipId,
      partsRequestId: request!.id,
      partId: part.id,
      partNo: part.partNo,
      description: part.description,
      quantity: line.quantity as string,
      discountPercent: (line.discountPercent as string | undefined) ?? '0',
      jobCardLineId: lineId,
    },
  });
  await ctx.audit({ entityType: 'parts.parts_request', entityId: request!.id, action: 'create', dealershipId, branchId, changes: { fromJobCardLine: lineId } });
}
