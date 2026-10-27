import type { EntityCtx } from '../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { lineAmount, taxOf } from '../../lib/money';
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
  const prices = new Map((await ctx.tx.part.findMany({ where: { partNo: { in: rows.map((r) => r.partNo).filter((x): x is string => !!x) } }, select: { partNo: true, sellingPrice: true } })).map((p) => [p.partNo, p.sellingPrice.toString()]));
  return rows.map((r) => ({ kind: r.kind as 'labour' | 'part' | 'check', description: r.description, partNo: r.partNo, quantity: r.quantity.toString(), sellingPrice: r.partNo ? (prices.get(r.partNo) ?? null) : null }));
}

export async function setPackageLines(ctx: EntityCtx, scheduleItemId: number, lines: { kind: 'labour' | 'part' | 'check'; description: string; partNo?: string | null; quantity: string }[]) {
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

/** Sales tax on the service charges (parts prices on the price list already include their sales tax). */
export const SERVICE_TAX_PERCENT = '18';

/** The store a job card's parts come from: its own branch, else the dealership's main branch. */
async function storeBranchId(ctx: EntityCtx, dealershipId: number, branchId: number | null) {
  if (branchId) return branchId;
  const main = await ctx.tx.branch.findFirst({ where: { dealershipId, code: 'MAIN' }, select: { id: true } });
  return (main ?? (await ctx.tx.branch.findFirst({ where: { dealershipId }, orderBy: { id: 'asc' }, select: { id: true } })))?.id ?? null;
}

interface ServiceInput {
  scheduleItemId: number;
  /** The advisor's service charges for this service, before sales tax (nothing is preset). */
  serviceCharge?: string | null;
  /** The parts to replace, as checked by the advisor: quantity, and a discount in percent where one is agreed. */
  parts: { partNo: string; quantity: string; discountPercent?: string | null }[];
  /** Send the parts request to the store now (the advisor has checked everything). */
  sendToStore: boolean;
}

/**
 * The advisor puts a periodic service on the job card after checking what it includes: the service charges they
 * entered (with the 18% sales tax added as its own line), and, when they click send, one parts request to the
 * store for the parts (with their discounts). The parts the store issues then appear on the job card by themselves.
 */
export async function addService(ctx: EntityCtx, jobCardId: number, input: ServiceInput) {
  const jc = await jobCards.findVisible(ctx, jobCardId);
  const card = { id: jc.id as number, dealershipId: jc.dealershipId as number, branchId: (jc.branchId as number | null) ?? null };
  if (!ctx.access.canIn(P.jobCardsUpdate, { dealershipId: card.dealershipId, branchId: card.branchId })) throw forbidden();
  if (!['open', 'in_progress'].includes(jc.status as string)) throw conflict(`This job card is ${jc.status}`);
  const visit = await ctx.tx.visit.findFirst({ where: { id: jc.visitId as number }, select: { freeService: true } });
  const freeVisit = !!visit?.freeService;
  const item = await ctx.tx.scheduleItem.findFirst({ where: { id: input.scheduleItemId } });
  if (!item) throw notFound('Service');

  // "4th service (30,000 km)" already names the km; "Oil service" does not.
  const km = item.dueKm.toLocaleString('en-PK');
  const baseDescription = item.name.includes(km) ? item.name : `${item.name} (${km} km service)`;
  const existing = await ctx.tx.jobCardLine.findFirst({ where: { jobCardId: card.id, description: baseDescription }, select: { id: true } });
  let linesAdded = 0;
  if (existing) {
    // A scheduled-service visit already has the service's labour line from the schedule: it only learns which service it is.
    await ctx.tx.jobCardLine.update({ where: { id: existing.id }, data: { scheduleItemId: item.id } });
  } else {
    const charge = input.serviceCharge?.trim();
    if (!charge || !(Number(charge) >= 0)) throw validationError([{ in: 'body', path: 'serviceCharge', message: 'Enter the service charges (before tax)' }]);
    const tax = taxOf(charge, SERVICE_TAX_PERCENT);
    const add = async (description: string, price: string) => {
      await ctx.tx.jobCardLine.create({
        data: { dealershipId: card.dealershipId, jobCardId: card.id, scheduleItemId: description === baseDescription ? item.id : null, kind: 'labour', description, quantity: '1', unitPrice: price, amount: lineAmount(price, '1'), billable: !freeVisit, source: 'schedule' },
        select: { id: true },
      });
      linesAdded += 1;
    };
    await add(baseDescription, charge);
    if (Number(tax) > 0) await add(`Sales tax ${SERVICE_TAX_PERCENT}% on the service charges`, tax);
  }

  let requestNo: string | null = null;
  let warning: string | null = null;
  if (input.sendToStore && input.parts.length) {
    const branchId = await storeBranchId(ctx, card.dealershipId, card.branchId);
    if (!branchId) throw validationError([{ in: 'body', path: 'parts', message: 'No store branch to ask for the parts' }]);
    const merged = new Map<string, { quantity: number; discountPercent: string }>();
    for (const p of input.parts) {
      const key = p.partNo.trim().toUpperCase();
      merged.set(key, { quantity: (merged.get(key)?.quantity ?? 0) + Number(p.quantity), discountPercent: p.discountPercent ?? merged.get(key)?.discountPercent ?? '0' });
    }
    const req = await createPartsRequest(ctx, {
      jobCardId: card.id,
      branchId,
      notes: `${baseDescription}: parts to replace`,
      lines: [...merged].map(([partNo, v]) => ({ partNo, quantity: String(v.quantity), discountPercent: v.discountPercent })),
    });
    requestNo = (req as { requestNo?: string }).requestNo ?? null;
  } else if (input.sendToStore) warning = 'There are no parts to send.';
  await ctx.audit({ entityType: 'service.job_card', entityId: card.id, action: 'update', dealershipId: card.dealershipId, branchId: card.branchId, changes: { serviceAdded: item.name, serviceCharge: input.serviceCharge ?? null, partsRequest: requestNo } });
  return { linesAdded, partsRequested: requestNo ? input.parts.length : 0, partsRequestNo: requestNo, warning };
}
