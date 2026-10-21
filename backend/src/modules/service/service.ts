import { execute, query } from '../../db/client';
import { and, eq, sql } from '../../db/sql';
import { POLICIES } from '../../config/policies';
import { LineService } from '../../entity/lines';
import type { EntityCtx, Row } from '../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { lineAmount } from '../../lib/money';
import type { z } from '../../lib/zod';
import { DocType, nextDocumentNumber } from '../core/documents';
import { vehicle } from '../master/models';
import { vehicleVisibility } from '../master/repository';
import { MasterPerm } from '../master/permissions';
import { vehicles, link, setOwner } from '../master/service';
import { assertActiveModel } from '../master/entities';
import { findDuplicateCustomer, findVehicleByIdentifiers, isLinked, modelNames } from '../master/repository';
import { normalizeCnic, normalizeIdentifier, normalizeMobile } from '../master/normalize';
import { pakistanToday } from '../../lib/dates';
import { previewCheckIn } from './checkin';
import { estimates, jobCards, visits } from './entities';
import { estimate, estimateLine, inspection, jobCardLine } from './models';
import { ServicePerm as P } from './permissions';
import {
  EstimateLineCreate,
  EstimateLineSchema,
  EstimateLineUpdate,
  JobCardLineCreate,
  JobCardLineSchema,
  JobCardLineUpdate,
  type EstimateCreate,
  type InspectionItemsUpdate,
  type RegisterVehicleBody,
} from './schemas';

// =============================================================================
// Check-in preview and the vehicle's schedule
// =============================================================================
export async function checkInPreview(ctx: EntityCtx, vehicleId: number, dealershipId: number) {
  if (!ctx.access.canIn(P.visitsCreate, { dealershipId })) throw forbidden();
  await vehicles.findVisible(ctx, vehicleId);
  const v = await ctx.tx.vehicle.findFirst({ where: { id: vehicleId } });
  return previewCheckIn(ctx, v!, dealershipId);
}

export async function vehicleServiceSchedule(ctx: EntityCtx, vehicleId: number) {
  const visible = await query<{ id: number }>(
    ctx.tx,
    sql`select ${vehicle.id} as "id" from ${vehicle}
        where ${and(eq(vehicle.id, vehicleId), vehicleVisibility(ctx.access, [MasterPerm.vehiclesView, P.visitsView, P.visitsViewOwn, P.visitsCreate]))}`,
  );
  if (!visible.length) throw notFound('Vehicle');
  return ctx.tx.vehicleSchedule.findMany({ where: { vehicleId }, orderBy: { sequence: 'asc' }, take: 100 });
}

/**
 * A car that is not in the system (bought elsewhere) comes for service: record its owner and the car so the
 * visit can be checked in. A car already known to the group is just added to this dealership, and a customer
 * with the same mobile or CNIC is reused. Free scheduled services do not apply (no delivery by us).
 */
export async function registerVehicleAtCheckIn(ctx: EntityCtx, input: z.output<typeof RegisterVehicleBody>) {
  const { dealershipId } = input;
  if (!ctx.access.canIn(P.visitsCreate, { dealershipId })) throw forbidden();
  await assertActiveModel(ctx, input.vehicle.modelId);

  const mobile = normalizeMobile(input.customer.mobile);
  if (!mobile) throw validationError([{ in: 'body', path: 'customer.mobile', message: 'Enter a valid mobile number, e.g. 03001234567' }]);
  const cnic = input.customer.cnic ? normalizeCnic(input.customer.cnic) : null;
  if (input.customer.cnic && !cnic) throw validationError([{ in: 'body', path: 'customer.cnic', message: 'CNIC must be 13 digits, e.g. 35202-1234567-1' }]);

  // The car: known to the group already (e.g. delivered by another of our dealerships)? Then add it here.
  const vin = normalizeIdentifier(input.vehicle.vin);
  const engineNo = input.vehicle.engineNo ? normalizeIdentifier(input.vehicle.engineNo) : null;
  const registrationNo = input.vehicle.registrationNo ? normalizeIdentifier(input.vehicle.registrationNo) : null;
  const [known] = await findVehicleByIdentifiers(ctx.tx, { vin, engineNo, registrationNo });

  // The customer: the same mobile / CNIC at this dealership is the same person.
  const dup = await findDuplicateCustomer(ctx.tx, dealershipId, mobile, cnic);
  const customerRow =
    dup ??
    (await ctx.tx.customer.create({
      data: {
        dealershipId,
        kind: 'individual',
        fullName: input.customer.fullName,
        mobile: (input.customer.mobile.trim().startsWith('+') ? '+' : '') + input.customer.mobile.replace(/\D/g, ''),
        mobileNormalized: mobile,
        cnic,
        address: input.customer.address ?? null,
        city: input.customer.city ?? null,
        createdById: ctx.access.userId,
        updatedById: ctx.access.userId,
      },
      select: { id: true, fullName: true },
    }));
  if (!dup) await ctx.audit({ entityType: 'master.customer', entityId: customerRow.id, action: 'create', dealershipId, changes: { fullName: input.customer.fullName, via: 'service check-in' } });

  let vehicleId: number;
  let already = false;
  if (known) {
    vehicleId = known.id;
    already = true;
    if (!(await isLinked(ctx.tx, vehicleId, dealershipId))) await link(ctx, vehicleId, dealershipId, 'service');
  } else {
    const created = await ctx.tx.vehicle.create({
      data: {
        vin,
        engineNo,
        registrationNo,
        modelId: input.vehicle.modelId,
        variant: input.vehicle.variant ?? null,
        color: input.vehicle.color ?? null,
        modelYear: input.vehicle.modelYear ?? null,
        // Bought elsewhere: with its customer, not in our stock (so it never shows in Open stock).
        status: 'delivered',
        notes: `Bought elsewhere${input.boughtFrom ? `: ${input.boughtFrom}` : ''}. Registered at service check-in.`,
        warrantyEndsOn: input.warrantyEndsOn ?? null,
        lastOdometerKm: input.odometerKm ?? null,
        createdById: ctx.access.userId,
        updatedById: ctx.access.userId,
      },
      select: { id: true },
    });
    vehicleId = created.id;
    await link(ctx, vehicleId, dealershipId, 'service');
    await ctx.audit({ entityType: 'master.vehicle', entityId: vehicleId, action: 'create', dealershipId, changes: { vin, registrationNo, boughtFrom: input.boughtFrom ?? null, via: 'service check-in' } });
  }

  // The customer is the owner here (unless they already are).
  const open = await ctx.tx.vehicleOwnership.findFirst({ where: { vehicleId, dealershipId, endDate: null }, select: { customerId: true } });
  if (open?.customerId !== customerRow.id) await setOwner(ctx, vehicleId, customerRow.id, dealershipId, pakistanToday());

  const v = await ctx.tx.vehicle.findFirst({ where: { id: vehicleId } });
  const model = (await modelNames(ctx.tx, [v!.modelId])).get(v!.modelId);
  return {
    vehicleId,
    customerId: customerRow.id,
    customerName: customerRow.fullName,
    vehicleLabel: [v!.registrationNo ?? 'Unregistered', model, v!.vin].filter(Boolean).join(' · '),
    alreadyInSystem: already,
  };
}

/** Subscriber: when Sales activates a vehicle, build its schedule from the model's configuration. */
export async function buildVehicleSchedule(ctx: EntityCtx, input: { vehicleId: number; modelId: number; activatedOn: string }) {
  const items = await ctx.tx.scheduleItem.findMany({
    where: { modelId: input.modelId, isActive: true },
    orderBy: { sequence: 'asc' },
  });
  if (!items.length) return 0;
  const rows = items.map((it) => {
    const due = new Date(`${input.activatedOn}T00:00:00Z`);
    due.setUTCMonth(due.getUTCMonth() + it.dueMonths);
    return {
      vehicleId: input.vehicleId,
      scheduleItemId: it.id,
      sequence: it.sequence,
      name: it.name,
      dueKm: it.dueKm,
      dueDate: due.toISOString().slice(0, 10),
      isFree: it.isFree,
      labourHours: it.labourHours,
    };
  });
  await ctx.tx.vehicleSchedule.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

// =============================================================================
// Job cards
// =============================================================================
/** Opens the job card for a checked-in visit; a scheduled service adds its labour line. */
export async function openJobCard(ctx: EntityCtx, visitId: number) {
  const v = await visits.findVisible(ctx, visitId, { lock: true });
  const target = { dealershipId: v.dealershipId as number, branchId: (v.branchId as number | null) ?? null };
  if (!ctx.access.canIn(P.jobCardsCreate, target)) throw forbidden();
  if (v.status !== 'open') throw conflict(`This visit is ${v.status}`);
  const existing = await ctx.tx.jobCard.findFirst({ where: { visitId }, select: { id: true } });
  if (existing) throw conflict('This visit already has a job card', { existingId: existing.id });

  const card = await ctx.tx.jobCard.create({
    data: {
      ...target,
      jobCardNo: await nextDocumentNumber(ctx.tx, target.dealershipId, DocType.jobCard),
      visitId,
      vehicleId: v.vehicleId as number,
      advisorId: v.advisorId as number,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    },
  });

  if (v.scheduleEntryId) {
    const entry = await ctx.tx.vehicleSchedule.findFirst({ where: { id: v.scheduleEntryId as number } });
    if (entry) {
      const rate = POLICIES.service.defaultLabourRatePerHour;
      await ctx.tx.jobCardLine.create({
        data: {
          dealershipId: target.dealershipId,
          jobCardId: card.id,
          kind: 'labour',
          description: `${entry.name} (${entry.dueKm.toLocaleString('en-PK')} km service)`,
          quantity: entry.labourHours,
          unitPrice: rate,
          amount: lineAmount(rate, entry.labourHours),
          billable: !v.freeService,
          source: 'schedule',
        },
        select: { id: true },
      });
    }
  }
  await ctx.audit({
    entityType: 'service.job_card',
    entityId: card.id,
    action: 'create',
    ...target,
    changes: { visitId, jobCardNo: card.jobCardNo },
  });
  return jobCards.get(ctx, card.id);
}

const priceLine = (_ctx: EntityCtx, _parent: Row, data: Record<string, unknown>) => ({
  ...data,
  amount: lineAmount(String(data.unitPrice), String(data.quantity)),
});

export const jobCardLines = new LineService({
  parent: jobCards,
  table: jobCardLine,
  parentKey: 'jobCardId',
  names: { singular: 'JobCardLine', plural: 'JobCardLines' },
  schemas: { read: JobCardLineSchema, create: JobCardLineCreate, update: JobCardLineUpdate },
  editPermission: P.jobCardsUpdate,
  maxLines: 200,
  sortKey: 'createdAt',
  locked: (p) => (['completed', 'cancelled'].includes(p.status as string) ? `This job card is ${p.status}` : null),
  // Customer-approved work and the scheduled service are fixed; change them through a new estimate.
  lineLocked: (l) => (l.source !== 'manual' ? 'This line comes from an approved estimate or the service schedule' : null),
  prepare: priceLine,
});

/** Technician marks a line done (or not done) while the job card is in progress. */
export async function setLineDone(ctx: EntityCtx, jobCardId: number, lineId: number, done: boolean) {
  const jc = await jobCards.findVisible(ctx, jobCardId, { lock: true });
  if (!jobCards.canOnRow(ctx.access, jc, P.jobCardsWork)) throw forbidden();
  if (jc.status !== 'in_progress') throw conflict('Start work on the job card first');
  const { count } = await ctx.tx.jobCardLine.updateMany({
    where: { id: lineId, jobCardId },
    data: done ? { status: 'done', doneById: ctx.access.userId, doneAt: new Date() } : { status: 'pending', doneById: null, doneAt: null },
  });
  const line = count ? await ctx.tx.jobCardLine.findFirst({ where: { id: lineId } }) : null;
  if (!line) throw notFound('JobCardLine');
  await ctx.audit({
    entityType: 'service.job_card',
    entityId: jobCardId,
    action: done ? 'line.done' : 'line.undone',
    dealershipId: jc.dealershipId as number,
    changes: { lineId },
  });
  return line;
}

/** Users who can work job cards in the job card's dealership (for the technician picker). */
export async function technicianOptions(ctx: EntityCtx, jobCardId: number) {
  const jc = await jobCards.findVisible(ctx, jobCardId);
  const rows = await query<{ id: number; fullName: string }>(
    ctx.tx,
    sql`
    select distinct u.id::int as "id", u.full_name as "fullName"
      from core.user_role ur
      join core.role_permission rp on rp.role_id = ur.role_id
      join core.permission p on p.id = rp.permission_id
      join core."user" u on u.id = ur.user_id
     where u.is_active and p.code = ${P.jobCardsWork}
       and (ur.dealership_id is null or ur.dealership_id = ${jc.dealershipId as number})
     order by "fullName" limit 200`,
  );
  return rows;
}

// =============================================================================
// Inspections (one per job card, seeded from the checklist template)
// =============================================================================
async function inspectionOf(ctx: EntityCtx, jobCardId: number) {
  const row = await ctx.tx.inspection.findFirst({ where: { jobCardId } });
  if (!row) return null;
  const items = await ctx.tx.inspectionItem.findMany({
    where: { inspectionId: row.id },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: 200,
  });
  const [u] = await query<{ name: string }>(ctx.tx, sql`select full_name as name from core."user" where id = ${row.inspectorId}`);
  return { ...row, inspectorName: u?.name ?? null, items };
}

export async function getInspection(ctx: EntityCtx, jobCardId: number) {
  await jobCards.findVisible(ctx, jobCardId);
  return inspectionOf(ctx, jobCardId);
}

export async function startInspection(ctx: EntityCtx, jobCardId: number) {
  const jc = await jobCards.findVisible(ctx, jobCardId, { lock: true });
  if (!jobCards.canOnRow(ctx.access, jc, P.inspectionsCreate)) throw forbidden();
  if (!['open', 'in_progress'].includes(jc.status as string)) throw conflict(`This job card is ${jc.status}`);
  if (await inspectionOf(ctx, jobCardId)) throw conflict('This job card already has an inspection');
  const template = await ctx.tx.inspectionTemplateItem.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: 200,
  });
  if (!template.length) throw conflict('The inspection checklist is empty; add items under Service setup');
  const row = await ctx.tx.inspection.create({
    data: {
      dealershipId: jc.dealershipId as number,
      branchId: (jc.branchId as number | null) ?? null,
      jobCardId,
      inspectorId: ctx.access.userId,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    },
  });
  await ctx.tx.inspectionItem.createMany({
    data: template.map((t, i) => ({ dealershipId: row.dealershipId, inspectionId: row.id, area: t.area, item: t.item, sortOrder: t.sortOrder * 1000 + i })),
  });
  await ctx.audit({ entityType: 'service.job_card', entityId: jobCardId, action: 'inspection.start', dealershipId: row.dealershipId });
  return inspectionOf(ctx, jobCardId);
}

async function editableInspection(ctx: EntityCtx, jobCardId: number) {
  const jc = await jobCards.findVisible(ctx, jobCardId);
  if (!jobCards.canOnRow(ctx.access, jc, P.inspectionsUpdate)) throw forbidden();
  await query(ctx.tx, sql`select 1 from ${inspection} where ${eq(inspection.jobCardId, jobCardId)} for update`);
  const row = await ctx.tx.inspection.findFirst({ where: { jobCardId } });
  if (!row) throw notFound('Inspection');
  if (row.status !== 'in_progress') throw conflict('This inspection is completed');
  return row;
}

export async function recordInspection(ctx: EntityCtx, jobCardId: number, input: z.output<typeof InspectionItemsUpdate>) {
  const row = await editableInspection(ctx, jobCardId);
  for (const it of input.items) {
    const { count: updated } = await ctx.tx.inspectionItem.updateMany({
      where: { id: it.id, inspectionId: row.id },
      data: { condition: it.condition, notes: it.notes ?? null },
    });
    if (!updated) throw validationError([{ in: 'body', path: 'items', message: `Item ${it.id} is not on this inspection` }]);
  }
  if (input.notes !== undefined) await ctx.tx.inspection.update({ where: { id: row.id }, data: { notes: input.notes ?? null } });
  await ctx.audit({ entityType: 'service.job_card', entityId: jobCardId, action: 'inspection.record', dealershipId: row.dealershipId, changes: input });
  return inspectionOf(ctx, jobCardId);
}

export async function completeInspection(ctx: EntityCtx, jobCardId: number) {
  const row = await editableInspection(ctx, jobCardId);
  const n = await ctx.tx.inspectionItem.count({ where: { inspectionId: row.id, condition: 'not_checked' } });
  if (n) throw conflict(`${n} item(s) are not checked yet`);
  await ctx.tx.inspection.update({
    where: { id: row.id },
    data: { status: 'completed', completedAt: new Date(), updatedById: ctx.access.userId },
  });
  await ctx.audit({ entityType: 'service.job_card', entityId: jobCardId, action: 'inspection.complete', dealershipId: row.dealershipId });
  return inspectionOf(ctx, jobCardId);
}

// =============================================================================
// Estimates
// =============================================================================
/** New draft estimate for a job card; optionally pre-filled from inspection findings needing attention. */
export async function createEstimate(ctx: EntityCtx, jobCardId: number, input: z.output<typeof EstimateCreate>) {
  const jc = await jobCards.findVisible(ctx, jobCardId);
  const target = { dealershipId: jc.dealershipId as number, branchId: (jc.branchId as number | null) ?? null };
  if (!ctx.access.canIn(P.estimatesCreate, target)) throw forbidden();
  if (!['open', 'in_progress'].includes(jc.status as string)) throw conflict(`This job card is ${jc.status}`);
  const v = await ctx.tx.visit.findFirst({ where: { id: jc.visitId as number }, select: { customerId: true } });

  const row = await ctx.tx.estimate.create({
    data: {
      ...target,
      estimateNo: await nextDocumentNumber(ctx.tx, target.dealershipId, DocType.estimate),
      jobCardId,
      customerId: v!.customerId,
      advisorId: jc.advisorId as number,
      validUntil: input.validUntil ?? null,
      notes: input.notes ?? null,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    },
  });

  if (input.fromInspection) {
    const found = await ctx.tx.inspectionItem.findMany({
      where: { inspection: { jobCardId }, condition: { in: ['attention', 'urgent'] } },
      select: { id: true, area: true, item: true, condition: true, notes: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (found.length) {
      await ctx.tx.estimateLine.createMany({
        data: found.map((f, i) => ({
          dealershipId: target.dealershipId,
          estimateId: row.id,
          kind: 'labour' as const,
          description: `${f.area}: ${f.item}${f.condition === 'urgent' ? ' (urgent)' : ''}${f.notes ? ` – ${f.notes}` : ''}`,
          quantity: '1',
          unitPrice: '0',
          amount: '0.00',
          inspectionItemId: f.id,
          sortOrder: i,
        })),
      });
    }
  }
  await ctx.audit({ entityType: 'service.estimate', entityId: row.id, action: 'create', ...target, changes: { jobCardId, fromInspection: input.fromInspection } });
  return estimates.get(ctx, row.id);
}

async function recomputeEstimateTotal(ctx: EntityCtx, parent: Row) {
  await execute(
    ctx.tx,
    sql`update ${estimate} set total_amount = (select coalesce(sum(amount), 0) from ${estimateLine} where estimate_id = ${parent.id}) where id = ${parent.id}`,
  );
}

export const estimateLines = new LineService({
  parent: estimates,
  table: estimateLine,
  parentKey: 'estimateId',
  names: { singular: 'EstimateLine', plural: 'EstimateLines' },
  schemas: { read: EstimateLineSchema, create: EstimateLineCreate, update: EstimateLineUpdate },
  editPermission: P.estimatesUpdate,
  maxLines: 200,
  sortKey: 'sortOrder',
  locked: (p) => (p.status !== 'draft' ? 'Only draft estimates can be changed' : null),
  prepare: priceLine,
  afterChange: recomputeEstimateTotal,
});
