/**
 * Appointments and reassigning on a lead.
 *  - Appointment: the lead's salesperson (own leads), the Assistant Manager or the Manager set when
 *    the customer comes (showroom visit, test drive…). On the day, everyone who follows the lead
 *    (its salesperson, the Assistant Manager, the Manager) is reminded (see appointmentReminders.ts).
 *  - Reassign: the Assistant Manager / Manager give a lead, with its quotations and PPF vouchers, to
 *    another salesperson. Its sales order (if any) stays credited to the original salesperson.
 */
import { query } from '../../../db/client';
import { sql } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { forbidden, HttpError, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { leads } from '../entities';
import { SalesPerm as P } from '../permissions';
import type { BulkReassignBody, LeadAppointmentBody, ReassignLeadBody } from '../schemas';
import { membersSql } from './teamReport';

const CLOSED = ['completed', 'exhausted'];

export async function setLeadAppointment(ctx: EntityCtx, leadId: number, input: z.output<typeof LeadAppointmentBody>) {
  const l = await leads.findVisible(ctx, leadId, { lock: true });
  const target = { dealershipId: l.dealershipId as number, branchId: (l.branchId as number | null) ?? null };
  const own = l.ownerId === ctx.access.userId && ctx.access.canIn(P.leadsUpdateOwn, target);
  if (!own && !ctx.access.canIn(P.leadsAppointment, target)) throw forbidden('Only the lead’s salesperson, the Assistant Manager or the Manager set appointments');
  if (CLOSED.includes(l.status as string)) throw validationError([{ in: 'body', path: 'appointmentAt', message: 'This lead is closed' }]);
  const at = input.appointmentAt ? new Date(input.appointmentAt) : null;
  // A minute's grace: "now" typed in the form is not in the past.
  if (at && at.getTime() < Date.now() - 60_000) throw validationError([{ in: 'body', path: 'appointmentAt', message: 'Choose a date and time from now on' }]);

  await ctx.tx.lead.update({
    where: { id: leadId },
    data: {
      appointmentAt: at,
      appointmentNote: at ? (input.note ?? null) : null,
      appointmentSetById: at ? ctx.access.userId : null,
      // A new (or moved) appointment is reminded again on its day.
      appointmentRemindedAt: null,
      updatedById: ctx.access.userId,
    },
    select: { id: true },
  });
  await ctx.audit({
    entityType: 'sales.lead',
    entityId: leadId,
    action: at ? 'appointment' : 'appointment.cancel',
    dealershipId: target.dealershipId,
    changes: { appointmentAt: at?.toISOString() ?? null, note: input.note ?? null },
  });
  return leads.get(ctx, leadId);
}

/**
 * Gives several leads to one person (each lead follows the same rules as a single transfer). Leads that
 * cannot be moved are skipped and reported; the rest are moved.
 */
export async function bulkReassignLeads(ctx: EntityCtx, input: z.output<typeof BulkReassignBody>) {
  const skipped: { leadId: number; reason: string }[] = [];
  let moved = 0;
  let toName = '';
  for (const leadId of new Set(input.leadIds)) {
    try {
      const l = await reassignLead(ctx, leadId, { ownerId: input.ownerId, note: input.note });
      moved++;
      toName = (l.ownerName as string | null) ?? toName;
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      // The person chosen is not a valid receiver: the same for every lead, so stop at once.
      if (e.status === 422 && JSON.stringify(e.details ?? '').includes('active member')) throw e;
      skipped.push({ leadId, reason: e.message });
    }
  }
  if (!toName) {
    const to = await ctx.tx.user.findUnique({ where: { id: input.ownerId }, select: { fullName: true } });
    toName = to?.fullName ?? '';
  }
  return { moved, toName, skipped };
}

export async function reassignLead(ctx: EntityCtx, leadId: number, input: z.output<typeof ReassignLeadBody>) {
  const l = await leads.findVisible(ctx, leadId, { lock: true });
  const dealershipId = l.dealershipId as number;
  const target = { dealershipId, branchId: (l.branchId as number | null) ?? null };
  // The Assistant Manager / Manager reassign any lead; the CRO transfers an own lead, or takes / passes on a social media one.
  const transfer = ctx.access.canIn(P.leadsTransfer, target) && (l.ownerId === ctx.access.userId || l.source === 'social');
  if (!ctx.access.canIn(P.leadsReassign, target) && !transfer) {
    throw forbidden('Only the Assistant Manager or the Manager reassign leads; a CRO transfers their own or social media leads');
  }
  if (l.status === 'completed') throw validationError([{ in: 'body', path: 'ownerId', message: 'This lead is completed (car delivered)' }]);
  const fromId = l.ownerId as number;
  if (input.ownerId === fromId) throw validationError([{ in: 'body', path: 'ownerId', message: 'The lead is already with this salesperson' }]);
  const [to] = await query<{ id: number; fullName: string }>(
    ctx.tx,
    sql`select id, "fullName" from (${membersSql(dealershipId)}) m where id = ${input.ownerId}`,
  );
  if (!to) throw validationError([{ in: 'body', path: 'ownerId', message: 'Choose an active member of the sales team at this dealership' }]);
  const from = await ctx.tx.user.findUnique({ where: { id: fromId }, select: { fullName: true } });

  await ctx.tx.lead.update({ where: { id: leadId }, data: { ownerId: to.id, updatedById: ctx.access.userId }, select: { id: true } });
  // Its quotations and PPF vouchers go with it, so the new salesperson sees and reprints them.
  await ctx.tx.quotation.updateMany({ where: { leadId, ownerId: fromId }, data: { ownerId: to.id } });
  await ctx.tx.ppfForm.updateMany({ where: { leadId, ownerId: fromId }, data: { ownerId: to.id } });
  await ctx.audit({
    entityType: 'sales.lead',
    entityId: leadId,
    action: 'reassign',
    dealershipId,
    changes: { ownerId: { from: fromId, to: to.id }, fromName: from?.fullName ?? null, toName: to.fullName, note: input.note ?? null },
  });
  return leads.get(ctx, leadId);
}
