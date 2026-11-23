/**
 * The PPF bay calendar. One bay serves the whole group (Hyundai, Jetour, CSM): one car starts per day (Sundays off) and
 * takes 4 to 5 days, so the estimate date is 4 working days after the start day. A day taken by any dealership is
 * taken for everyone. Booked by a PPF voucher (the salesperson picks a free day) or directly by the PPF team
 * (a car from our own reference).
 */
import type { EntityCtx } from '../../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../../lib/errors';
import { addDays, pakistanToday } from '../../../lib/dates';
import { SalesPerm as P } from '../permissions';
import type { PpfSlotBookBody, PpfSlotUpdateBody, PpfSlotsQuery } from '../schemas';
import type { z } from '../../../lib/zod';

/** The first day of the PPF bay: no day before it is shown or can be booked. */
export const PPF_BAY_OPENS = '2026-11-23';
const isSunday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
const workingDay = (d: string) => (isSunday(d) ? addDays(d, 1) : d);
/** 4 working days after the start (the start is day 1, so a Monday car is ready on Friday). */
export function ppfEstimateDate(start: string) {
  let d = start;
  for (let n = 0; n < 4; ) {
    d = addDays(d, 1);
    if (!isSunday(d)) n += 1;
  }
  return d;
}

const target = (dealershipId: number) => ({ dealershipId, branchId: null });
const canSee = (ctx: EntityCtx, dealershipId: number) =>
  [P.ppfViewAll, P.ppfViewOwn, P.ppfCreate, P.ppfSlots].some((p) => ctx.access.canIn(p, target(dealershipId)));
const day = (v: unknown) => String(v).slice(0, 10);

export async function listPpfSlots(ctx: EntityCtx, q: z.output<typeof PpfSlotsQuery>) {
  if (!canSee(ctx, q.dealershipId)) throw forbidden('You cannot see the PPF slots');
  const canManage = ctx.access.canIn(P.ppfSlots, target(q.dealershipId));
  const today = pakistanToday();
  const first = today < PPF_BAY_OPENS ? PPF_BAY_OPENS : today;
  const from = workingDay(q.from && q.from > first ? q.from : first);
  const to = addDays(from, q.days);
  const earliest = q.back ? (addDays(today, -q.back) < PPF_BAY_OPENS ? PPF_BAY_OPENS : addDays(today, -q.back)) : from;
  // The bay is shared: every dealership's bookings count.
  const rows = await ctx.tx.ppfSlot.findMany({
    where: { cancelledAt: null, slotDate: { gte: new Date(`${earliest}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
  });
  const formIds = rows.flatMap((r) => (r.ppfFormId ? [r.ppfFormId] : []));
  const forms = formIds.length ? await ctx.tx.ppfForm.findMany({ where: { id: { in: formIds } }, select: { id: true, formNo: true, ownerId: true, chassisNo: true, engineNo: true, installationDate: true } }) : [];
  const formOf = new Map(forms.map((f) => [Number(f.id), f]));
  const dealerIds = [...new Set(rows.map((r) => r.dealershipId))];
  const dealers = dealerIds.length ? await ctx.tx.dealership.findMany({ where: { id: { in: dealerIds } }, select: { id: true, name: true } }) : [];
  const dealerName = new Map(dealers.map((d) => [Number(d.id), d.name]));
  const userIds = [...new Set([...rows.flatMap((r) => (r.createdById ? [r.createdById] : [])), ...forms.map((f) => f.ownerId)])];
  const users = userIds.length ? await ctx.tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
  const userName = new Map(users.map((u) => [Number(u.id), u.fullName]));
  const by = new Map(rows.filter((r) => !r.extra).map((r) => [day(r.slotDate), r]));
  const extrasBy = new Map<string, typeof rows>();
  for (const r of rows.filter((x) => x.extra)) extrasBy.set(day(r.slotDate), [...(extrasBy.get(day(r.slotDate)) ?? []), r]);
  const days = [];
  // Cars that started before today and are still in the bay (the estimate date has not passed).
  const dates = rows.map((r) => day(r.slotDate)).filter((d) => d < from && d >= earliest);
  for (const d of dates.sort()) {
    const f = by.get(d)?.ppfFormId ? formOf.get(Number(by.get(d)!.ppfFormId)) : undefined;
    if (!canManage && (f?.installationDate ? day(f.installationDate) : ppfEstimateDate(d)) < today) continue;
    days.push(dayRow(d));
  }
  // The PPF team can also open an earlier day (a car they started early, or one finished before its estimate date).
  if (canManage && q.back) {
    const have = new Set(days.map((x) => x.date));
    for (let d = earliest; d < from; d = addDays(d, 1)) if (!isSunday(d) && !have.has(d)) days.push(dayRow(d));
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isSunday(d)) continue;
    days.push(dayRow(d));
  }
  return { canManage, days };

  function dayRow(d: string) {
    const r = by.get(d);
    const mine = !!r && Number(r.createdById) === ctx.access.userId;
    const detail = !!r && (canManage || mine);
    const form = r?.ppfFormId ? formOf.get(Number(r.ppfFormId)) : undefined;
    return {
      date: d,
      booked: !!r,
      mine,
      estimateDate: form?.installationDate ? day(form.installationDate) : ppfEstimateDate(d),
      blocked: !!r?.blocked,
      receivedOn: r?.receivedOn ? day(r.receivedOn) : null,
      finishedOn: r?.finishedOn ? day(r.finishedOn) : null,
      past: d < today,
      bookingId: canManage && r ? Number(r.id) : null,
      customerName: detail ? r!.customerName : null,
      customerMobile: detail ? r!.customerMobile : null,
      vehicle: detail ? r!.vehicle : null,
      formNo: detail ? (form?.formNo ?? null) : null,
      dealershipName: canManage && r ? (dealerName.get(Number(r.dealershipId)) ?? null) : null,
      bookedByName: canManage && r && r.createdById ? (userName.get(Number(r.createdById)) ?? null) : null,
      salespersonName: detail && form ? (userName.get(Number(form.ownerId)) ?? null) : detail ? (r!.salespersonName ?? (r!.createdById ? (userName.get(Number(r!.createdById)) ?? null) : null)) : null,
      chassisNo: detail ? (form?.chassisNo ?? r!.chassisNo ?? null) : null,
      engineNo: detail ? (form?.engineNo ?? r!.engineNo ?? null) : null,
      registrationNo: detail ? (r!.registrationNo ?? null) : null,
      amount: detail && r!.amount != null ? String(r!.amount) : null,
      extras: canManage
        ? (extrasBy.get(d) ?? []).map((x) => ({
            bookingId: Number(x.id),
            customerName: x.customerName,
            customerMobile: x.customerMobile,
            vehicle: x.vehicle,
            salespersonName: x.salespersonName,
            chassisNo: x.chassisNo,
            engineNo: x.engineNo,
            registrationNo: x.registrationNo,
            amount: x.amount != null ? String(x.amount) : null,
            dealershipName: dealerName.get(Number(x.dealershipId)) ?? null,
          }))
        : [],
    };
  }
}

/**
 * Books exactly the asked day for the whole group. The caller has checked the right to book.
 * A day that is Sunday, in the past or already taken is refused (the picker only offers free days).
 */
export async function bookPpfDay(
  ctx: EntityCtx,
  dealershipId: number,
  asked: string,
  who: {
    customerName: string;
    customerMobile?: string | null;
    vehicle?: string | null;
    notes?: string | null;
    blocked?: boolean;
    chassisNo?: string | null;
    engineNo?: string | null;
    registrationNo?: string | null;
    salespersonName?: string | null;
    amount?: string | null;
    /** An extra car on a taken day (the PPF team). */
    extra?: boolean;
  },
  /** The PPF team may book a day up to a week back (a car that was started early). */
  allowPast = false,
) {
  const today = pakistanToday();
  if (asked < PPF_BAY_OPENS) throw validationError([{ in: 'body', path: 'slotDate', message: `The PPF bay opens on ${PPF_BAY_OPENS.split('-').reverse().join('-')}` }]);
  if (allowPast ? asked < addDays(today, -7) : asked < today) throw validationError([{ in: 'body', path: 'slotDate', message: 'Choose today or a later day' }]);
  if (isSunday(asked)) throw validationError([{ in: 'body', path: 'slotDate', message: 'The PPF bay is closed on Sundays' }]);
  // One booking at a time for the whole bay, so two people cannot take the same day.
  await ctx.tx.$executeRaw`select pg_advisory_xact_lock(${7001}::int, ${0}::int)`;
  const taken = await ctx.tx.ppfSlot.findFirst({ where: { cancelledAt: null, slotDate: new Date(`${asked}T00:00:00Z`) }, select: { id: true } });
  if (taken && !who.extra) throw conflict('That day is already taken. Choose another free day, or add it as an extra car.');
  const slot = await ctx.tx.ppfSlot.create({
    data: {
      dealershipId,
      slotDate: new Date(`${asked}T00:00:00Z`),
      customerName: who.customerName,
      customerMobile: who.customerMobile ?? null,
      vehicle: who.vehicle ?? null,
      notes: who.notes ?? null,
      blocked: who.blocked ?? false,
      chassisNo: who.chassisNo ?? null,
      engineNo: who.engineNo ?? null,
      registrationNo: who.registrationNo ?? null,
      salespersonName: who.salespersonName ?? null,
      amount: who.amount ?? null,
      // An extra car only when the day really is taken; otherwise it is the day's own car.
      extra: !!who.extra && !!taken,
      createdById: ctx.access.userId,
    },
  });
  await ctx.audit({ entityType: 'sales.ppf_slot', entityId: Number(slot.id), action: 'create', dealershipId, branchId: null, changes: { slotDate: asked, customerName: who.customerName } });
  return { id: Number(slot.id), slotDate: asked, estimateDate: ppfEstimateDate(asked) };
}

/** The PPF team books a car into the bay directly. */
export async function bookPpfSlot(ctx: EntityCtx, input: z.output<typeof PpfSlotBookBody>) {
  if (!ctx.access.canIn(P.ppfSlots, target(input.dealershipId))) throw forbidden('You cannot book PPF slots');
  // The vehicle line: the model and the variant.
  const model = input.modelId ? await ctx.tx.vehicleModel.findUnique({ where: { id: input.modelId }, select: { name: true } }) : null;
  const vehicle = [model?.name, input.variant].filter(Boolean).join(' ') || input.vehicle || null;
  return bookPpfDay(ctx, input.dealershipId, input.slotDate, { ...input, customerName: input.customerName || (input.blocked ? 'Closed' : 'PPF car'), vehicle, amount: input.amount ?? null }, true);
}

/** The PPF team corrects the details of a booking (the car, its numbers, the salesperson, the amount). */
export async function updatePpfSlot(ctx: EntityCtx, id: number, input: z.output<typeof PpfSlotUpdateBody>) {
  const slot = await ctx.tx.ppfSlot.findUnique({ where: { id } });
  if (!slot || slot.cancelledAt) throw notFound('Booking not found');
  if (!ctx.access.canIn(P.ppfSlots, target(Number(slot.dealershipId)))) throw forbidden('You cannot change PPF bookings');
  const data: Record<string, unknown> = {};
  for (const k of ['customerName', 'customerMobile', 'vehicle', 'chassisNo', 'engineNo', 'registrationNo', 'salespersonName', 'notes'] as const) {
    if (input[k] !== undefined) data[k] = k === 'customerName' ? (input[k] || slot.customerName) : (input[k] ?? null);
  }
  if (input.amount !== undefined) data.amount = input.amount ?? null;
  await ctx.tx.ppfSlot.update({ where: { id }, data });
  await ctx.audit({ entityType: 'sales.ppf_slot', entityId: id, action: 'update', dealershipId: Number(slot.dealershipId), branchId: null, changes: { slotDate: day(slot.slotDate) } });
  return { ok: true as const };
}

async function bayBooking(ctx: EntityCtx, id: number) {
  const slot = await ctx.tx.ppfSlot.findUnique({ where: { id } });
  if (!slot || slot.cancelledAt || slot.blocked) throw notFound('Booking not found');
  if (!ctx.access.canIn(P.ppfSlots, target(Number(slot.dealershipId)))) throw forbidden('You cannot update PPF bookings');
  return slot;
}

/** The PPF team marks that the car has come to the bay. The salesperson of its voucher sees the status. */
export async function receivePpfSlot(ctx: EntityCtx, id: number) {
  const slot = await bayBooking(ctx, id);
  const today = new Date(`${pakistanToday()}T00:00:00Z`);
  await ctx.tx.ppfSlot.update({ where: { id }, data: { receivedOn: today } });
  if (slot.ppfFormId) {
    const form = await ctx.tx.ppfForm.update({ where: { id: slot.ppfFormId }, data: { bayStatus: 'received', receivedOn: today }, select: { dealershipId: true } });
    await ctx.audit({ entityType: 'sales.ppf_form', entityId: Number(slot.ppfFormId), action: 'bay_received', dealershipId: Number(form.dealershipId), branchId: null, changes: { bayStatus: 'received' } });
  }
  return { ok: true as const };
}

/**
 * The PPF team marks the work on a car as done (today, possibly before its estimate date): the voucher's estimate date follows
 * and its salesperson is told that the car is ready.
 */
export async function finishPpfSlot(ctx: EntityCtx, id: number) {
  const slot = await bayBooking(ctx, id);
  const today = new Date(`${pakistanToday()}T00:00:00Z`);
  await ctx.tx.ppfSlot.update({ where: { id }, data: { finishedOn: today, receivedOn: slot.receivedOn ?? today } });
  if (slot.ppfFormId) {
    const form = await ctx.tx.ppfForm.update({
      where: { id: slot.ppfFormId },
      data: { installationDate: today, bayStatus: 'done', finishedOn: today, receivedOn: undefined },
      select: { dealershipId: true },
    });
    await ctx.audit({ entityType: 'sales.ppf_form', entityId: Number(slot.ppfFormId), action: 'bay_done', dealershipId: Number(form.dealershipId), branchId: null, changes: { bayStatus: 'done' } });
  }
  await ctx.audit({ entityType: 'sales.ppf_slot', entityId: id, action: 'finish', dealershipId: Number(slot.dealershipId), branchId: null, changes: { finishedOn: pakistanToday(), slotDate: day(slot.slotDate) } });
  return { ok: true as const };
}

export async function cancelPpfSlot(ctx: EntityCtx, id: number) {
  const slot = await ctx.tx.ppfSlot.findUnique({ where: { id } });
  if (!slot || slot.cancelledAt) throw notFound('Booking not found');
  if (!ctx.access.canIn(P.ppfSlots, target(Number(slot.dealershipId)))) throw forbidden('You cannot cancel PPF bookings');
  await ctx.tx.ppfSlot.update({ where: { id }, data: { cancelledAt: new Date() } });
  await ctx.audit({ entityType: 'sales.ppf_slot', entityId: id, action: 'cancel', dealershipId: Number(slot.dealershipId), branchId: null, changes: { slotDate: day(slot.slotDate), customerName: slot.customerName } });
  return { ok: true as const };
}
