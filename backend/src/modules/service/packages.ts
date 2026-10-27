import { POLICIES } from '../../config/policies';
import type { EntityCtx } from '../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { lineAmount } from '../../lib/money';
import { createPartsRequest } from '../parts/service';
import { jobCards } from './entities';
import { ServicePerm as P } from './permissions';

/**
 * What a periodic service includes (the 5,000 km service: its labour and the parts to replace). Kept per model
 * under Service schedules; opening the service on a job card adds the labour and asks the store for the parts.
 */
export async function packageLines(ctx: EntityCtx, scheduleItemId: number) {
  const item = await ctx.tx.scheduleItem.findFirst({ where: { id: scheduleItemId }, select: { id: true } });
  if (!item) throw notFound('Service');
  const rows = await ctx.tx.scheduleItemLine.findMany({ where: { scheduleItemId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  return rows.map((r) => ({ kind: r.kind as 'labour' | 'part', description: r.description, partNo: r.partNo, quantity: r.quantity.toString() }));
}

export async function setPackageLines(ctx: EntityCtx, scheduleItemId: number, lines: { kind: 'labour' | 'part'; description: string; partNo?: string | null; quantity: string }[]) {
  if (!ctx.access.hasGlobal(P.setupManage)) throw forbidden();
  const item = await ctx.tx.scheduleItem.findFirst({ where: { id: scheduleItemId }, select: { id: true, name: true } });
  if (!item) throw notFound('Service');
  for (const [i, l] of lines.entries()) {
    if (l.kind === 'part') {
      const part = l.partNo ? await ctx.tx.part.findFirst({ where: { partNo: l.partNo.trim().toUpperCase() }, select: { id: true } }) : null;
      if (!part) throw validationError([{ in: 'body', path: `lines.${i}.partNo`, message: `Part ${l.partNo ?? ''} is not in the catalogue` }]);
    }
  }
  await ctx.tx.scheduleItemLine.deleteMany({ where: { scheduleItemId } });
  if (lines.length) {
    await ctx.tx.scheduleItemLine.createMany({
      data: lines.map((l, i) => ({
        scheduleItemId,
        kind: l.kind,
        description: l.description.trim(),
        partNo: l.kind === 'part' ? (l.partNo ?? '').trim().toUpperCase() : null,
        quantity: l.quantity,
        sortOrder: (i + 1) * 10,
      })),
    });
  }
  await ctx.audit({ entityType: 'service.schedule_item', entityId: scheduleItemId, action: 'update', dealershipId: null, branchId: null, changes: { includes: lines } });
  return packageLines(ctx, scheduleItemId);
}

/** The store a job card's parts come from: its own branch, else the dealership's main branch. */
async function storeBranchId(ctx: EntityCtx, dealershipId: number, branchId: number | null) {
  if (branchId) return branchId;
  const main = await ctx.tx.branch.findFirst({ where: { dealershipId, code: 'MAIN' }, select: { id: true } });
  return (main ?? (await ctx.tx.branch.findFirst({ where: { dealershipId }, orderBy: { id: 'asc' }, select: { id: true } })))?.id ?? null;
}

/**
 * Puts a periodic service on a job card: its labour as job card lines (the service itself, then what it includes)
 * and one parts request to the store for the parts to replace. The parts the store issues then appear on the job
 * card by themselves. `baseLine`: also the service's own labour line (hours x the labour rate).
 */
export async function addServiceToJobCard(
  ctx: EntityCtx,
  card: { id: number; dealershipId: number; branchId: number | null },
  scheduleItemId: number,
  opts: { baseLine: boolean; freeVisit: boolean },
) {
  const item = await ctx.tx.scheduleItem.findFirst({ where: { id: scheduleItemId } });
  if (!item) throw notFound('Service');
  const includes = await ctx.tx.scheduleItemLine.findMany({ where: { scheduleItemId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  const rate = POLICIES.service.defaultLabourRatePerHour;
  const baseDescription = `${item.name} (${item.dueKm.toLocaleString('en-PK')} km service)`;
  if (await ctx.tx.jobCardLine.findFirst({ where: { jobCardId: card.id, description: baseDescription }, select: { id: true } })) {
    throw conflict(`${item.name} is already on this job card`);
  }

  let added = 0;
  const addLabour = async (description: string, hours: string) => {
    await ctx.tx.jobCardLine.create({
      data: { dealershipId: card.dealershipId, jobCardId: card.id, kind: 'labour', description, quantity: hours, unitPrice: rate, amount: lineAmount(rate, hours), billable: !opts.freeVisit, source: 'schedule' },
      select: { id: true },
    });
    added += 1;
  };
  if (opts.baseLine) await addLabour(baseDescription, item.labourHours.toString());
  for (const l of includes.filter((x) => x.kind === 'labour')) await addLabour(l.description, l.quantity.toString());

  // The parts to replace: one request to the store (a part listed twice is asked for once, with the total).
  const wanted = new Map<string, number>();
  for (const l of includes.filter((x) => x.kind === 'part' && x.partNo)) wanted.set(l.partNo!, (wanted.get(l.partNo!) ?? 0) + Number(l.quantity));
  let requestNo: string | null = null;
  let warning: string | null = null;
  if (wanted.size) {
    const branchId = await storeBranchId(ctx, card.dealershipId, card.branchId);
    if (!branchId) warning = 'No store branch to ask for the parts.';
    else {
      try {
        const req = await createPartsRequest(ctx, {
          jobCardId: card.id,
          branchId,
          notes: `${item.name} (${item.dueKm.toLocaleString('en-PK')} km): parts to replace`,
          lines: [...wanted].map(([partNo, qty]) => ({ partNo, quantity: String(qty) })),
        });
        requestNo = (req as { requestNo?: string }).requestNo ?? null;
      } catch (e) {
        // The service is still added; the advisor asks for the parts by hand.
        warning = `The parts could not be requested: ${(e as Error).message}`;
      }
    }
  }
  await ctx.audit({ entityType: 'service.job_card', entityId: card.id, action: 'update', dealershipId: card.dealershipId, branchId: card.branchId, changes: { serviceAdded: item.name, partsRequest: requestNo } });
  return { linesAdded: added, partsRequested: wanted.size, partsRequestNo: requestNo, warning };
}

/** The advisor adds a periodic service (5,000 km ...) to an open job card. */
export async function addService(ctx: EntityCtx, jobCardId: number, scheduleItemId: number) {
  const jc = await jobCards.findVisible(ctx, jobCardId);
  if (!ctx.access.canIn(P.jobCardsUpdate, { dealershipId: jc.dealershipId as number, branchId: (jc.branchId as number | null) ?? null })) throw forbidden();
  if (!['open', 'in_progress'].includes(jc.status as string)) throw conflict(`This job card is ${jc.status}`);
  const visit = await ctx.tx.visit.findFirst({ where: { id: jc.visitId as number }, select: { freeService: true } });
  return addServiceToJobCard(ctx, { id: jc.id as number, dealershipId: jc.dealershipId as number, branchId: (jc.branchId as number | null) ?? null }, scheduleItemId, { baseLine: true, freeVisit: !!visit?.freeService });
}
