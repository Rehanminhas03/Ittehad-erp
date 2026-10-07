/**
 * Lead journey (Salesperson / CRO / Assistant Manager):
 *   log (name + phone) → follow-ups → "Convert to Lead" (qualifying details) → Admin raises the order.
 * Duplicate phone numbers are blocked; the salesperson can escalate the existing lead so the
 * Assistant Manager may convert it on the owner's behalf.
 */
import { execute, query } from '../../../db/client';
import { expectedDelivery } from '../../../lib/dates';
import { ensureCustomerCnic } from './orders';
import { pickColumns } from '../../../db/delegate';
import { and, eq, inArray, sql } from '../../../db/sql';
import { withNames } from '../../../entity/names';
import { diffChanges } from '../../core/audit';
import type { EntityCtx } from '../../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { assertActiveModel } from '../../master/entities';
import { customer } from '../../master/models';
import { USER_NAME } from '../../master/nameSources';
import { normalizeMobile } from '../../master/normalize';
import { findDuplicateCustomer } from '../../master/repository';
import { assertNoActiveLead, leads } from '../entities';
import { ACTIVE_LEAD_STATES, lead } from '../models';
import { SalesPerm as P } from '../permissions';
import type { ConvertLeadBody, EscalateDuplicateBody, LeadDetailsBody, LeadFollowUpCreate } from '../schemas';

const OPEN_STATES = ['new', 'follow_up', 'visited'];

const targetOf = (l: Record<string, unknown>) => ({ dealershipId: l.dealershipId as number, branchId: (l.branchId as number | null) ?? null });

function assertOpen(l: Record<string, unknown>) {
  if (!OPEN_STATES.includes(l.status as string)) throw conflict(`This lead is already ${l.status as string}`);
}

// ---- Follow-ups ---------------------------------------------------------------
/** Records a call / message / visit; "visited" moves the lead to Visited. */
export async function recordFollowUp(ctx: EntityCtx, leadId: number, input: z.output<typeof LeadFollowUpCreate>) {
  const l = await leads.findVisible(ctx, leadId, { lock: true });
  if (!leads.canOnRow(ctx.access, l, P.leadsUpdate, P.leadsUpdateOwn)) throw forbidden();
  assertOpen(l);
  if (input.outcome === 'visited') {
    // Visits are the CRO's: a walk-in customer is already in the showroom.
    if (l.source === 'walk_in') {
      throw validationError([{ in: 'body', path: 'outcome', message: 'A walk-in customer has already visited the showroom' }]);
    }
    if (!ctx.access.canIn(P.leadsRecordVisit, targetOf(l))) throw forbidden('Only the CRO records in-person visits');
  }

  await ctx.tx.leadFollowUp.create({
    data: {
      dealershipId: l.dealershipId as number,
      leadId,
      outcome: input.outcome,
      remarks: input.remarks ?? null,
      createdById: ctx.access.userId,
    },
  });
  await ctx.tx.lead.update({
    where: { id: leadId },
    data: { followUpCount: { increment: 1 }, lastFollowUpAt: new Date(), updatedById: ctx.access.userId },
  });
  await ctx.audit({
    entityType: 'sales.lead',
    entityId: leadId,
    action: 'follow_up',
    ...targetOf(l),
    changes: { outcome: input.outcome, remarks: input.remarks ?? null },
  });

  if (input.markLost) {
    // Not interested: the lead is lost (hidden from the leads list; the same phone can come back as a new lead).
    await ctx.tx.lead.update({
      where: { id: leadId },
      data: { lostAt: new Date(), lostById: ctx.access.userId, lostReason: input.remarks ?? 'Not interested' },
    });
    await leads.transition(ctx, leadId, 'mark_lost', input.remarks ?? 'Not interested', { system: true });
  } else if (input.outcome === 'visited') {
    if (l.status !== 'visited') await leads.transition(ctx, leadId, 'visit', input.remarks ?? undefined, { system: true });
  } else if (l.status === 'new') {
    await leads.transition(ctx, leadId, 'follow_up', input.remarks ?? undefined, { system: true });
  }
  return leads.get(ctx, leadId);
}

export async function listFollowUps(ctx: EntityCtx, leadId: number) {
  await leads.findVisible(ctx, leadId);
  const rows = await ctx.tx.leadFollowUp.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 100 });
  const named = await withNames(ctx.tx, rows as never, { createdByName: { key: 'createdById', source: USER_NAME } });
  // Each follow-up with its comments (oldest first): questions from the Manager / AM and the answers.
  const comments = await withNames(
    ctx.tx,
    (await ctx.tx.leadFollowUpComment.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' }, take: 500 })) as never,
    { createdByName: { key: 'createdById', source: USER_NAME } },
  );
  return named.map((f) => ({
    ...f,
    comments: comments
      .filter((c) => c.followUpId === f.id)
      .map((c) => ({ id: c.id as number, body: c.body as string, createdById: c.createdById as number, createdByName: (c.createdByName as string | null) ?? null, createdAt: c.createdAt })),
  }));
}

/**
 * A comment on a follow-up: anyone who sees the lead (the Manager, the Assistant Manager, later the
 * CEO) asks to clarify what the customer said, and the salesperson answers. Everyone following the
 * lead is notified and sees the thread under the follow-up.
 */
export async function commentOnFollowUp(ctx: EntityCtx, leadId: number, followUpId: number, input: { body: string }) {
  const l = await leads.findVisible(ctx, leadId);
  const f = await ctx.tx.leadFollowUp.findFirst({ where: { id: followUpId, leadId }, select: { id: true } });
  if (!f) throw notFound('Follow-up');
  await ctx.tx.leadFollowUpComment.create({
    data: { dealershipId: l.dealershipId as number, leadId, followUpId, body: input.body, createdById: ctx.access.userId },
  });
  await ctx.audit({ entityType: 'sales.lead', entityId: leadId, action: 'follow_up.comment', ...targetOf(l), changes: { followUpId, comment: input.body } });
  return listFollowUps(ctx, leadId);
}

// ---- Convert to Lead ------------------------------------------------------------
/**
 * Captures the qualifying details and hands the lead to the dealership's Admin.
 * Allowed for the owner (convert_own); for the team leader (Assistant Manager / Manager, convert_own)
 * who logged the lead, also when they logged it for a salesperson (who stays the owner); or the
 * Assistant Manager (convert_escalated) but only on a lead escalated after a duplicate-phone block.
 * The customer record is reused by phone or created.
 */
export async function convertLead(ctx: EntityCtx, leadId: number, input: z.output<typeof ConvertLeadBody>) {
  const l = await leads.findVisible(ctx, leadId, { lock: true });
  const target = targetOf(l);
  const mine = l.ownerId === ctx.access.userId || l.createdById === ctx.access.userId;
  const asOwner = mine && ctx.access.canIn(P.leadsConvertOwn, target);
  const asEscalation = ctx.access.canIn(P.leadsConvertEscalated, target);
  if (!asOwner) {
    if (!asEscalation) throw forbidden('Only the lead owner can convert this lead');
    if (!l.escalatedAt) throw forbidden('Assistant Managers can convert only duplicate customers a salesperson sent to them');
  }
  assertOpen(l);
  await assertActiveModel(ctx, input.interestedModelId);

  const dealershipId = target.dealershipId;
  // The name and phone can be corrected while converting; a new phone must not belong to another open lead.
  const name = input.prospectName ?? (l.prospectName as string);
  const phone = input.prospectMobile ?? (l.prospectMobile as string);
  const phoneNormalized = input.prospectMobile ? normalizeMobile(input.prospectMobile)! : (l.prospectMobileNormalized as string);
  if (phoneNormalized !== l.prospectMobileNormalized) await assertNoActiveLead(ctx, dealershipId, phoneNormalized, leadId);
  const corrected = diffChanges(l, { prospectName: name, prospectMobile: phone });

  let customerId = (l.customerId as number | null) ?? null;
  if (customerId && Object.keys(corrected).length) {
    const dup = await findDuplicateCustomer(ctx.tx, dealershipId, phoneNormalized, null, customerId);
    if (dup) throw conflict(`Another customer already has this phone number: ${dup.fullName}`);
    await ctx.tx.customer.update({
      where: { id: customerId },
      data: { fullName: name, mobile: phone, mobileNormalized: phoneNormalized, updatedById: ctx.access.userId },
    });
  }
  if (!customerId) {
    const existing = await findDuplicateCustomer(ctx.tx, dealershipId, phoneNormalized, null);
    if (existing) {
      customerId = existing.id;
      // Keeps an email already on the customer.
      await execute(
        ctx.tx,
        sql`update ${customer} set email = coalesce(${customer.email}, ${input.email ?? null}), updated_at = now() where ${customer.id} = ${existing.id}`,
      );
    } else {
      const c = await ctx.tx.customer.create({
        data: {
          dealershipId,
          kind: 'individual',
          fullName: name,
          mobile: phone,
          mobileNormalized: phoneNormalized,
          email: input.email,
          createdById: ctx.access.userId,
          updatedById: ctx.access.userId,
        },
        select: { id: true },
      });
      customerId = c.id;
      await ctx.audit({ entityType: 'master.customer', entityId: customerId, action: 'create', dealershipId, changes: { fromLeadId: leadId } });
    }
  }

  // The customer's CNIC (required at conversion): the Admin checks it against the copy when raising the order.
  await ensureCustomerCnic(ctx, customerId, dealershipId, input.customerCnic);

  await ctx.tx.lead.update({
    where: { id: leadId },
    data: {
      customerId,
      prospectName: name,
      prospectMobile: phone,
      prospectMobileNormalized: phoneNormalized,
      interestedModelId: input.interestedModelId,
      preferredColor: input.preferredColor,
      variant: input.variant,
      email: input.email,
      paymentInstrument: input.paymentInstrument,
      paymentInstrumentRef: input.paymentInstrumentRef,
      paymentInstrumentBank: input.paymentInstrumentBank ?? null,
      paymentAmount: input.paymentAmount ?? null,
      // Individual or corporate (the company is the billing name on the order's documents).
      customerType: input.customerType,
      companyName: input.customerType === 'corporate' ? (input.companyName ?? null) : null,
      contactDesignation: input.customerType === 'corporate' ? (input.contactDesignation ?? null) : null,
      purchaseOrderNo: input.customerType === 'corporate' ? (input.purchaseOrderNo ?? null) : null,
      // Told to the customer; copied to the sales order when the Admin raises it.
      ...expectedDelivery(input.expectedDeliveryDate ?? (l.expectedDeliveryDate as string | null), input.expectedDeliveryDate ? input.expectedDeliveryByMonth : (l.expectedDeliveryByMonth as boolean)),
      notes: input.notes ?? (l.notes as string | null),
      convertedAt: new Date(),
      convertedById: ctx.access.userId,
      updatedById: ctx.access.userId,
    },
  });
  if (Object.keys(corrected).length) await ctx.audit({ entityType: 'sales.lead', entityId: leadId, action: 'details.update', ...target, changes: corrected });
  await leads.transition(ctx, leadId, 'convert', asOwner ? undefined : 'Converted by the Assistant Manager (duplicate customer)', { system: true });
  return leads.get(ctx, leadId);
}

// ---- Correcting customer details (also after conversion) ---------------------------------
/**
 * Fixes the customer's name, phone, email, colour, variant or notes on a lead, including once it is
 * converted or its order is being processed (the owner, or the Sales Admin). The linked customer
 * record follows, so the sales order shows the corrected details. Completed / exhausted leads stay as
 * they are. Every change is recorded in the activity log.
 */
export async function correctLeadDetails(ctx: EntityCtx, leadId: number, input: z.output<typeof LeadDetailsBody>) {
  const l = await leads.findVisible(ctx, leadId, { lock: true });
  const target = targetOf(l);
  const allowed =
    leads.canOnRow(ctx.access, l, P.leadsUpdate, P.leadsUpdateOwn) ||
    (!OPEN_STATES.includes(l.status as string) && ctx.access.canIn(P.leadsUpdateConverted, target));
  if (!allowed) throw forbidden('Only the salesperson who owns this lead or the Sales Admin can change its details');
  if (['completed', 'exhausted'].includes(l.status as string)) throw conflict(`This lead is ${l.status as string}; its details can no longer be changed`);

  const patch: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (typeof patch.prospectMobile === 'string') {
    patch.prospectMobileNormalized = normalizeMobile(patch.prospectMobile);
    await assertNoActiveLead(ctx, target.dealershipId, patch.prospectMobileNormalized as string, leadId);
  }
  const changes = diffChanges(l, patch);
  delete changes.prospectMobileNormalized;
  if (!Object.keys(changes).length) return leads.get(ctx, leadId);

  // The customer created at conversion carries the same name / phone / email.
  const customerId = l.customerId as number | null;
  if (customerId && (patch.prospectName !== undefined || patch.prospectMobile !== undefined || patch.email !== undefined)) {
    const customerPatch: Record<string, unknown> = {};
    if (patch.prospectName !== undefined) customerPatch.fullName = patch.prospectName;
    if (patch.email !== undefined) customerPatch.email = patch.email;
    if (patch.prospectMobile !== undefined) {
      const dup = await findDuplicateCustomer(ctx.tx, target.dealershipId, patch.prospectMobileNormalized as string, null, customerId);
      if (dup) throw conflict(`Another customer already has this phone number: ${dup.fullName}`);
      customerPatch.mobile = patch.prospectMobile;
      customerPatch.mobileNormalized = patch.prospectMobileNormalized;
    }
    await ctx.tx.customer.update({ where: { id: customerId }, data: { ...customerPatch, updatedById: ctx.access.userId } });
  }

  await ctx.tx.lead.update({ where: { id: leadId }, data: pickColumns(lead, { ...patch, updatedById: ctx.access.userId }) });
  await ctx.audit({ entityType: 'sales.lead', entityId: leadId, action: 'details.update', ...target, changes });
  return leads.get(ctx, leadId);
}

// ---- Duplicate escalation -----------------------------------------------------------
/**
 * A salesperson was blocked by "Duplicate lead already exists": flag the existing lead so the
 * Assistant Manager can open that exact record (and convert it if its owner is unavailable).
 */
export async function escalateDuplicate(ctx: EntityCtx, input: z.output<typeof EscalateDuplicateBody>) {
  if (!ctx.access.canIn(P.leadsCreate, { dealershipId: input.dealershipId })) throw forbidden();
  const mobileNormalized = normalizeMobile(input.prospectMobile)!;
  // Looked up regardless of owner (RLS still confines it to the caller's dealerships).
  const [locked] = await query<{ id: number }>(
    ctx.tx,
    sql`select ${lead.id} as id from ${lead}
         where ${and(
           eq(lead.dealershipId, input.dealershipId),
           eq(lead.prospectMobileNormalized, mobileNormalized),
           inArray(lead.status, [...ACTIVE_LEAD_STATES]),
         )}
         for update`,
  );
  const existing = locked ? await ctx.tx.lead.findUnique({ where: { id: locked.id } }) : null;
  if (!existing) throw notFound('Lead');
  if (existing.ownerId === ctx.access.userId) throw conflict('This lead is already yours');
  if (existing.escalatedAt) return { leadId: existing.id, escalatedAt: existing.escalatedAt };

  const escalatedAt = new Date();
  await ctx.tx.lead.update({
    where: { id: existing.id },
    data: { escalatedAt, escalatedById: ctx.access.userId, escalationNote: input.note ?? null },
  });
  await ctx.audit({
    entityType: 'sales.lead',
    entityId: existing.id,
    action: 'escalate',
    dealershipId: existing.dealershipId,
    branchId: existing.branchId,
    changes: { escalatedById: ctx.access.userId, note: input.note ?? null },
  });
  return { leadId: existing.id, escalatedAt };
}
