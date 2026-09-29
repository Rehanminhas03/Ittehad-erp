import { query } from '../../db/client';
import { sql } from '../../db/sql';
import { EntityService } from '../../entity/entityService';
import { withNames } from '../../entity/names';
import type { EntityConfig, EntityCtx, Row } from '../../entity/types';
import { conflict, validationError } from '../../lib/errors';
import { cmpMoney } from '../../lib/money';
import { BoolQuery, IdQuery, z } from '../../lib/zod';
import { DocType, nextDocumentNumber } from '../core/documents';
import { CUSTOMER_NAME, MODEL_NAME, USER_NAME, VEHICLE_LABEL } from '../master/nameSources';
import { link, vehicles } from '../master/service';
import { computeCheckIn, releaseCheckIn } from './checkin';
import { estimate, inspectionTemplateItem, jobCard, scheduleItem, visit } from './models';
import { ServicePerm as P } from './permissions';
import {
  EstimateSchema,
  EstimateUpdate,
  InspectionTemplateItemCreate,
  InspectionTemplateItemSchema,
  InspectionTemplateItemUpdate,
  JobCardSchema,
  JobCardUpdate,
  ScheduleItemCreate,
  ScheduleItemSchema,
  ScheduleItemUpdate,
  VisitCreate,
  VisitSchema,
  VisitUpdate,
} from './schemas';

const statusFilter = (states: readonly string[]) => ({ key: 'status', schema: z.enum(states as [string, ...string[]]) });
const JOB_CARD_NO = { table: jobCard, id: jobCard.id, label: jobCard.jobCardNo };
const VISIT_NO = { table: visit, id: visit.id, label: visit.visitNo };

// =============================================================================
// Setup (global configuration)
// =============================================================================
export const scheduleItemEntity: EntityConfig = {
  entityType: 'service.schedule_item',
  module: 'service',
  path: 'schedule-items',
  names: { singular: 'ScheduleItem', plural: 'ScheduleItems' },
  table: scheduleItem,
  schemas: { read: ScheduleItemSchema, create: ScheduleItemCreate, update: ScheduleItemUpdate },
  permissions: { view: P.setupView, create: P.setupManage, update: P.setupManage, delete: P.setupManage },
  tenant: null,
  search: ['name'],
  filters: { modelId: { key: 'modelId', schema: IdQuery }, isActive: { key: 'isActive', schema: BoolQuery } },
  sort: { default: 'sequence', keys: ['sequence', 'dueKm', 'name'] },
  hooks: {
    decorate: (ctx, rows) => withNames(ctx.tx, rows, { modelName: { key: 'modelId', source: MODEL_NAME } }),
  },
};

export const inspectionTemplateEntity: EntityConfig = {
  entityType: 'service.inspection_template_item',
  module: 'service',
  path: 'inspection-template',
  names: { singular: 'InspectionTemplateItem', plural: 'InspectionTemplateItems' },
  table: inspectionTemplateItem,
  schemas: { read: InspectionTemplateItemSchema, create: InspectionTemplateItemCreate, update: InspectionTemplateItemUpdate },
  permissions: { view: P.setupView, create: P.setupManage, update: P.setupManage, delete: P.setupManage },
  tenant: null,
  search: ['area', 'item'],
  filters: { isActive: { key: 'isActive', schema: BoolQuery } },
  sort: { default: 'sortOrder', keys: ['sortOrder', 'area', 'item'] },
};

// =============================================================================
// Visits
// =============================================================================
export const visitEntity: EntityConfig = {
  entityType: 'service.visit',
  module: 'service',
  path: 'visits',
  names: { singular: 'Visit', plural: 'Visits' },
  table: visit,
  schemas: { read: VisitSchema, create: VisitCreate, update: VisitUpdate },
  permissions: { view: P.visitsView, viewOwn: P.visitsViewOwn, create: P.visitsCreate, update: P.visitsUpdate },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'advisorId',
  search: ['visitNo'],
  filters: {
    status: statusFilter(['open', 'in_progress', 'ready', 'delivered', 'cancelled']),
    visitType: { key: 'visitType', schema: z.string().max(20) },
    vehicleId: { key: 'vehicleId', schema: IdQuery },
    customerId: { key: 'customerId', schema: IdQuery },
  },
  sort: { default: '-arrivedAt', keys: ['arrivedAt', 'visitNo', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'open',
    states: [
      { key: 'open', label: 'Checked in' },
      { key: 'in_progress', label: 'In progress' },
      { key: 'ready', label: 'Ready' },
      { key: 'delivered', label: 'Delivered', terminal: true },
      { key: 'cancelled', label: 'Cancelled', terminal: true },
    ],
    transitions: [
      // Driven by the job card.
      { action: 'start', label: 'Work started', from: ['open'], to: 'in_progress', permission: P.jobCardsWork, system: true },
      { action: 'ready', label: 'Work completed', from: ['in_progress'], to: 'ready', permission: P.jobCardsWork, system: true },
      {
        action: 'deliver',
        label: 'Hand back to customer',
        from: ['ready'],
        to: 'delivered',
        permission: P.visitsUpdate,
        effect: async (ctx, row) => {
          const on = new Date().toISOString().slice(0, 10);
          await ctx.tx.visit.update({ where: { id: row.id }, data: { deliveredAt: new Date() } });
          if (row.scheduleEntryId) {
            await ctx.tx.vehicleSchedule.updateMany({
              where: { id: row.scheduleEntryId as number },
              data: { status: 'done', visitId: row.id, completedOn: on },
            });
          }
          await ctx.tx.vehicle.updateMany({ where: { id: row.vehicleId as number }, data: { lastServiceOn: on } });
        },
      },
      {
        action: 'cancel',
        label: 'Cancel visit',
        from: ['open'],
        to: 'cancelled',
        permission: P.visitsUpdate,
        requiresComment: true,
        effect: async (ctx, row) => {
          await ctx.tx.jobCard.updateMany({ where: { visitId: row.id }, data: { status: 'cancelled', updatedById: ctx.access.userId } });
          await releaseCheckIn(ctx, row.vehicleId as number);
        },
      },
    ],
  },
  hooks: {
    beforeCreate: async (ctx, data) => {
      // The vehicle must be one the user can see; it becomes linked to the servicing dealership.
      await vehicles.findVisible(ctx, data.vehicleId as number);
      await link(ctx, data.vehicleId as number, data.dealershipId as number, 'service');
      const computed = await computeCheckIn(ctx, {
        vehicleId: data.vehicleId as number,
        dealershipId: data.dealershipId as number,
        customerId: data.customerId as number | null | undefined,
        visitType: data.visitType as string,
        odometerKm: data.odometerKm as number,
      });
      return {
        ...data,
        ...computed,
        advisorId: ctx.access.userId,
        visitNo: await nextDocumentNumber(ctx.tx, data.dealershipId as number, DocType.serviceVisit),
      };
    },
    beforeUpdate: async (_ctx, row, patch) => {
      if (['delivered', 'cancelled'].includes(row.status as string)) throw conflict(`This visit is ${row.status}`);
      return patch;
    },
    decorate: async (ctx, rows) => {
      const named = await withNames(ctx.tx, rows, {
        vehicleLabel: { key: 'vehicleId', source: VEHICLE_LABEL },
        customerName: { key: 'customerId', source: CUSTOMER_NAME },
        advisorName: { key: 'advisorId', source: USER_NAME },
      });
      const ids = rows.map((r) => r.id);
      const cards = ids.length
        ? await ctx.tx.jobCard.findMany({ where: { visitId: { in: ids } }, select: { id: true, visitId: true } })
        : [];
      const byVisit = new Map(cards.map((c) => [c.visitId, c.id]));
      return named.map((r) => ({ ...r, jobCardId: byVisit.get(r.id) ?? null }));
    },
  },
};

// =============================================================================
// Job cards
// =============================================================================
async function assertJobCardComplete(ctx: EntityCtx, row: Row): Promise<string | null> {
  const total = await ctx.tx.jobCardLine.count({ where: { jobCardId: row.id } });
  const pending = await ctx.tx.jobCardLine.count({ where: { jobCardId: row.id, status: 'pending' } });
  if (!total) return 'Add the work done before completing the job card';
  if (pending) return `${pending} line(s) are not marked done yet`;
  const open = await ctx.tx.estimate.count({ where: { jobCardId: row.id, status: 'submitted' } });
  if (open) return 'An estimate is still waiting for approval';
  return null;
}

export const jobCardEntity: EntityConfig = {
  entityType: 'service.job_card',
  module: 'service',
  path: 'job-cards',
  names: { singular: 'JobCard', plural: 'JobCards' },
  table: jobCard,
  // Opened from a visit (see service.ts).
  schemas: { read: JobCardSchema, update: JobCardUpdate },
  permissions: { view: P.jobCardsView, update: P.jobCardsUpdate },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  search: ['jobCardNo'],
  filters: {
    status: statusFilter(['open', 'in_progress', 'completed', 'cancelled']),
    technicianId: { key: 'technicianId', schema: IdQuery },
    vehicleId: { key: 'vehicleId', schema: IdQuery },
  },
  sort: { default: '-createdAt', keys: ['createdAt', 'jobCardNo', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'open',
    states: [
      { key: 'open', label: 'Open' },
      { key: 'in_progress', label: 'In progress' },
      { key: 'completed', label: 'Completed', terminal: true },
      { key: 'cancelled', label: 'Cancelled', terminal: true },
    ],
    transitions: [
      {
        action: 'start',
        label: 'Start work',
        from: ['open'],
        to: 'in_progress',
        permission: P.jobCardsWork,
        guard: (_ctx, row) => (row.technicianId ? null : 'Assign a technician first'),
        effect: async (ctx, row) => {
          await ctx.tx.jobCard.update({ where: { id: row.id }, data: { startedAt: new Date() } });
          await visits.transition(ctx, row.visitId as number, 'start', undefined, { system: true });
        },
      },
      {
        action: 'complete',
        label: 'Complete job card',
        from: ['in_progress'],
        to: 'completed',
        permission: P.jobCardsWork,
        guard: assertJobCardComplete,
        effect: async (ctx, row) => {
          await ctx.tx.jobCard.update({ where: { id: row.id }, data: { completedAt: new Date() } });
          await visits.transition(ctx, row.visitId as number, 'ready', undefined, { system: true });
        },
      },
    ],
  },
  hooks: {
    beforeUpdate: async (ctx, row, patch) => {
      if (['completed', 'cancelled'].includes(row.status as string)) throw conflict(`This job card is ${row.status}`);
      if (patch.technicianId) await assertTechnician(ctx, patch.technicianId as number, row.dealershipId as number);
      return patch;
    },
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, {
        visitNo: { key: 'visitId', source: VISIT_NO },
        vehicleLabel: { key: 'vehicleId', source: VEHICLE_LABEL },
        advisorName: { key: 'advisorId', source: USER_NAME },
        technicianName: { key: 'technicianId', source: USER_NAME },
      }),
  },
};

/** A technician must be an active user who can work job cards in this dealership. */
export async function assertTechnician(ctx: EntityCtx, userId: number, dealershipId: number) {
  const rows = await query<{ ok: boolean }>(ctx.tx, sql`
    select exists (
      select 1 from core.user_role ur
        join core.role_permission rp on rp.role_id = ur.role_id
        join core.permission p on p.id = rp.permission_id
        join core."user" u on u.id = ur.user_id
       where ur.user_id = ${userId} and u.is_active
         and p.code = ${P.jobCardsWork}
         and (ur.dealership_id is null or ur.dealership_id = ${dealershipId})
    ) as ok`);
  if (!rows[0]?.ok) throw validationError([{ in: 'body', path: 'technicianId', message: 'Choose a technician of this dealership' }]);
}

// =============================================================================
// Estimates
// =============================================================================
export const estimateEntity: EntityConfig = {
  entityType: 'service.estimate',
  module: 'service',
  path: 'estimates',
  names: { singular: 'Estimate', plural: 'Estimates' },
  table: estimate,
  // Created from a job card (see service.ts).
  schemas: { read: EstimateSchema, update: EstimateUpdate },
  permissions: { view: P.estimatesView, viewOwn: P.estimatesViewOwn, update: P.estimatesUpdate },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'advisorId',
  search: ['estimateNo'],
  filters: {
    status: statusFilter(['draft', 'submitted', 'approved', 'rejected']),
    jobCardId: { key: 'jobCardId', schema: IdQuery },
  },
  sort: { default: '-createdAt', keys: ['createdAt', 'estimateNo', 'totalAmount', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'draft',
    states: [
      { key: 'draft', label: 'Draft' },
      { key: 'submitted', label: 'Awaiting approval' },
      { key: 'approved', label: 'Approved', terminal: true },
      { key: 'rejected', label: 'Rejected' },
    ],
    transitions: [
      {
        action: 'submit',
        label: 'Submit for approval',
        from: ['draft'],
        to: 'submitted',
        permission: P.estimatesSubmit,
        guard: async (ctx, row) => {
          const n = await ctx.tx.estimateLine.count({ where: { estimateId: row.id } });
          if (!n) return 'Add at least one line';
          return cmpMoney(row.totalAmount as string, '0') > 0 ? null : 'Price the lines before submitting';
        },
      },
      {
        action: 'approve',
        label: 'Approve (customer agreed)',
        from: ['submitted'],
        to: 'approved',
        permission: P.estimatesApprove,
        guard: async (ctx, row) => {
          const jc = await ctx.tx.jobCard.findFirst({ where: { id: row.jobCardId as number }, select: { status: true } });
          return jc && ['open', 'in_progress'].includes(jc.status) ? null : 'The job card is no longer open';
        },
        // Approved work goes onto the job card.
        effect: async (ctx, row) => {
          const lines = await ctx.tx.estimateLine.findMany({ where: { estimateId: row.id } });
          if (lines.length) {
            await ctx.tx.jobCardLine.createMany({
              data: lines.map((l) => ({
                dealershipId: l.dealershipId,
                jobCardId: row.jobCardId as number,
                kind: l.kind,
                description: l.description,
                partNo: l.partNo,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                amount: l.amount,
                source: 'estimate' as const,
                estimateLineId: l.id,
              })),
            });
          }
        },
      },
      { action: 'reject', label: 'Reject', from: ['submitted'], to: 'rejected', permission: P.estimatesApprove, requiresComment: true },
      { action: 'revise', label: 'Revise', from: ['rejected'], to: 'draft', permission: P.estimatesUpdate },
    ],
  },
  hooks: {
    beforeUpdate: async (_ctx, row, patch) => {
      if (row.status !== 'draft') throw conflict('Only draft estimates can be edited');
      return patch;
    },
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, {
        jobCardNo: { key: 'jobCardId', source: JOB_CARD_NO },
        customerName: { key: 'customerId', source: CUSTOMER_NAME },
      }),
  },
};

export const visits = new EntityService(visitEntity);
export const jobCards = new EntityService(jobCardEntity);
export const estimates = new EntityService(estimateEntity);
