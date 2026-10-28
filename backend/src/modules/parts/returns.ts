import type { EntityCtx, Row } from '../../entity/types';
import { conflict, forbidden, validationError } from '../../lib/errors';
import type { z } from '../../lib/zod';
import { DocType, nextDocumentNumber } from '../core/documents';
import { jobCards } from '../service/entities';
import { partsRequests } from './entities';
import { PartsPerm as P } from './permissions';
import type { PartsReturnCreate } from './schemas';
import { issueDirect } from './store';

/**
 * The workshop sends parts that were issued to a job card back to the store (not used, replaced, wrong part ...).
 * It is a parts request of kind 'return': the parts desk checks the parts and accepts it, and only then do the
 * parts go back into stock and come off the job card. Nobody types the part into the stock by hand.
 */
export async function createPartsReturn(ctx: EntityCtx, input: z.output<typeof PartsReturnCreate>) {
  const jc = await jobCards.findVisible(ctx, input.jobCardId);
  const dealershipId = jc.dealershipId as number;
  if (!ctx.access.canIn(P.requestsCreate, { dealershipId, branchId: (jc.branchId as number | null) ?? null })) throw forbidden();
  if (!['open', 'in_progress'].includes(jc.status as string)) throw conflict(`This job card is ${jc.status}`);

  // Parts to return, once each (the quantities of a part asked twice are added).
  const wanted = new Map<string, { quantity: number; reason: string }>();
  for (const l of input.lines) {
    const key = l.partNo.trim().toUpperCase();
    const prev = wanted.get(key);
    wanted.set(key, { quantity: (prev?.quantity ?? 0) + Number(l.quantity), reason: prev ? `${prev.reason}; ${l.reason}` : l.reason });
  }

  const resolved: { partId: number; partNo: string; description: string; quantity: number; reason: string; branchId: number }[] = [];
  let i = 0;
  for (const [partNo, w] of wanted) {
    const part = await ctx.tx.part.findFirst({ where: { partNo }, select: { id: true, partNo: true, description: true } });
    if (!part) throw validationError([{ in: 'body', path: `lines.${i}.partNo`, message: `Part ${partNo} is not in the catalogue` }]);
    // What the store issued to this job card, less what is already on its way back.
    const issued = await ctx.tx.jobCardLine.findMany({ where: { jobCardId: jc.id as number, partNo: part.partNo, source: 'parts' }, select: { quantity: true } });
    const have = issued.reduce((n, x) => n + Number(x.quantity), 0);
    const pending = await ctx.tx.partsRequestLine.findMany({
      where: { partId: part.id, partsRequest: { jobCardId: jc.id as number, kind: 'return', status: 'open' } },
      select: { quantity: true },
    });
    const waiting = pending.reduce((n, x) => n + Number(x.quantity), 0);
    const room = have - waiting;
    if (w.quantity > room) throw validationError([{ in: 'body', path: `lines.${i}.quantity`, message: room > 0 ? `Only ${room} of ${part.partNo} can still be returned from this job card` : `${part.partNo} was not issued to this job card (or is already being returned)` }]);
    // The store the part was issued from.
    const out = await ctx.tx.inventoryTransaction.findFirst({ where: { referenceType: 'job_card', referenceId: jc.id as number, partId: part.id, type: 'issue' }, orderBy: { id: 'desc' }, select: { branchId: true } });
    const branchId = out?.branchId ?? (jc.branchId as number | null) ?? (await ctx.tx.branch.findFirst({ where: { dealershipId, code: 'MAIN' }, select: { id: true } }))?.id;
    if (!branchId) throw validationError([{ in: 'body', path: `lines.${i}.partNo`, message: 'No store branch found for this part' }]);
    resolved.push({ partId: part.id, partNo: part.partNo, description: part.description, quantity: w.quantity, reason: w.reason, branchId });
    i += 1;
  }
  // One return request per store the parts came from.
  const byBranch = new Map<number, typeof resolved>();
  for (const r of resolved) byBranch.set(r.branchId, [...(byBranch.get(r.branchId) ?? []), r]);
  const made: Row[] = [];
  for (const [branchId, lines] of byBranch) {
    const req = await ctx.tx.partsRequest.create({
      data: {
        dealershipId,
        branchId,
        requestNo: await nextDocumentNumber(ctx.tx, dealershipId, DocType.partsRequest),
        jobCardId: jc.id as number,
        requestedById: ctx.access.userId,
        notes: input.notes ?? null,
        kind: 'return',
        createdById: ctx.access.userId,
        updatedById: ctx.access.userId,
      },
    });
    await ctx.tx.partsRequestLine.createMany({
      data: lines.map((l) => ({ dealershipId, partsRequestId: req.id, partId: l.partId, partNo: l.partNo, description: l.description, quantity: String(l.quantity), reason: l.reason })),
    });
    await ctx.audit({ entityType: 'parts.parts_request', entityId: req.id, action: 'create', dealershipId, branchId, changes: { kind: 'return', lines: lines.map((l) => ({ partNo: l.partNo, quantity: l.quantity, reason: l.reason })) } });
    made.push(await partsRequests.get(ctx, req.id));
  }
  return made[0]!;
}

/**
 * The parts desk accepts a return: the parts go back into stock (at their issue cost) and come off the job card.
 * Runs inside the accept transition, so a refused return changes nothing.
 */
export async function acceptPartsReturn(ctx: EntityCtx, row: Row) {
  const lines = await ctx.tx.partsRequestLine.findMany({ where: { partsRequestId: row.id as number } });
  if (!lines.length) throw conflict('This return has no parts');
  await issueDirect(ctx, {
    kind: 'return',
    dealershipId: row.dealershipId as number,
    branchId: row.branchId as number,
    jobCardId: row.jobCardId as number,
    notes: `Return ${row.requestNo as string} accepted by the store`,
    lines: lines.map((l) => ({ partNo: l.partNo, quantity: l.quantity.toString() })),
  });
  // A line's returned quantity may not exceed its issued quantity (a database rule): the parts the store took in are both.
  for (const l of lines) await ctx.tx.partsRequestLine.update({ where: { id: l.id }, data: { issuedQty: l.quantity, returnedQty: l.quantity } });
}

/** Whether a return is waiting for the store (used by the job card to show "return requested" on a part). */
export async function pendingReturnQuantities(ctx: EntityCtx, jobCardId: number) {
  const rows = await ctx.tx.partsRequestLine.findMany({ where: { partsRequest: { jobCardId, kind: 'return', status: 'open' } }, select: { partNo: true, quantity: true } });
  const out: Record<string, string> = {};
  for (const r of rows) out[r.partNo] = String((Number(out[r.partNo] ?? 0) + Number(r.quantity)));
  return out;
}
