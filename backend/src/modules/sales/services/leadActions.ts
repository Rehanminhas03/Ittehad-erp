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
import { forbidden, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { leads } from '../entities';
import { SalesPerm as P } from '../permissions';
import type { LeadAppointmentBody, ReassignLeadBody } from '../schemas';
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

export async function reassignLead(ctx: EntityCtx, leadId: number, input: z.output<typeof ReassignLeadBody>) {
  const l = await leads.findVisible(ctx, leadId, { lock: true });
  const dealershipId = l.dealershipId as number;
  if (!ctx.access.canIn(P.leadsReassign, { dealershipId, branchId: (l.branchId as number | null) ?? null })) {
    throw forbidden('Only the Assistant Manager or the Manager reassign leads');
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
