import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, numeric, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigintId, createdAt, pk } from '../../db/columns';
import { serviceSchema } from '../../db/pgSchemas';
import { branchFk, dealership, tenantPolicy, trackedColumns, trackedIndexes, user } from '../core/models';
import { customer, vehicle, vehicleModel } from '../master/models';

const money = () => numeric({ precision: 14, scale: 2, mode: 'string' });
const qty = () => numeric({ precision: 10, scale: 2, mode: 'string' });

export const VISIT_TYPES = ['scheduled', 'paid_service', 'repair', 'warranty', 'accident', 'inspection'] as const;
export const VISIT_STATES = ['open', 'in_progress', 'ready', 'delivered', 'cancelled'] as const;
export const JOB_CARD_STATES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export const ESTIMATE_STATES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export const INSPECTION_STATES = ['in_progress', 'completed'] as const;
export const LINE_KINDS = ['labour', 'part'] as const;
export const CONDITIONS = ['not_checked', 'ok', 'attention', 'urgent'] as const;

// ===========================================================================
// Configuration (group-wide, maintained with a global grant)
// ===========================================================================

/** The service schedule of a vehicle model: 1st service at 1,000 km / 1 month, ... */
export const scheduleItem = serviceSchema.table(
  'schedule_item',
  {
    id: pk(),
    modelId: bigintId()
      .notNull()
      .references(() => vehicleModel.id),
    sequence: integer().notNull(),
    name: text().notNull(),
    /** Due at this odometer reading (km)... */
    dueKm: integer().notNull(),
    /** ...or this many months after activation, whichever comes first. */
    dueMonths: integer().notNull(),
    isFree: boolean().notNull().default(false),
    /** Labour hours added to the job card for this service. */
    labourHours: qty().notNull().default('1'),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [
    unique().on(t.modelId, t.sequence),
    check('schedule_item_positive', sql`${t.sequence} > 0 and ${t.dueKm} >= 0 and ${t.dueMonths} >= 0`),
    index().on(t.modelId),
    ...trackedIndexes(t),
  ],
);

/** Multi-point inspection checklist used to seed every inspection. */
export const inspectionTemplateItem = serviceSchema.table(
  'inspection_template_item',
  {
    id: pk(),
    area: text().notNull(),
    item: text().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [unique().on(t.area, t.item), ...trackedIndexes(t)],
);

// ===========================================================================
// Per-vehicle schedule (built when the vehicle is activated). Keyed by vehicle, visible through the
// vehicle's dealership links, so any dealership servicing the car sees and advances it.
// ===========================================================================
export const vehicleSchedule = serviceSchema.table(
  'vehicle_schedule',
  {
    id: pk(),
    vehicleId: bigintId()
      .notNull()
      .references(() => vehicle.id),
    scheduleItemId: bigintId().references(() => scheduleItem.id),
    sequence: integer().notNull(),
    name: text().notNull(),
    dueKm: integer().notNull(),
    dueDate: date({ mode: 'string' }).notNull(),
    isFree: boolean().notNull(),
    labourHours: qty().notNull(),
    status: text({ enum: ['due', 'done'] }).notNull().default('due'),
    visitId: bigintId(),
    completedOn: date({ mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.vehicleId, t.sequence), index().on(t.scheduleItemId), index().on(t.visitId), index().on(t.dueDate)],
);

// ===========================================================================
// Service visit (check-in) -> job card -> inspection / estimates
// ===========================================================================
export const visit = serviceSchema.table(
  'visit',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    visitNo: text().notNull().unique(),
    vehicleId: bigintId()
      .notNull()
      .references(() => vehicle.id),
    customerId: bigintId()
      .notNull()
      .references(() => customer.id),
    /** Service advisor who owns the visit (view_own). */
    advisorId: bigintId()
      .notNull()
      .references(() => user.id),
    visitType: text({ enum: VISIT_TYPES }).notNull(),
    /** Auto-computed: which scheduled service this is (1st, 2nd, ...), for scheduled visits. */
    serviceNumber: integer(),
    scheduleEntryId: bigintId().references(() => vehicleSchedule.id),
    /** Auto-computed: the vehicle's nth visit anywhere in the group. */
    visitSequence: integer().notNull(),
    odometerKm: integer().notNull(),
    arrivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    promisedAt: timestamp({ withTimezone: true }),
    complaints: text(),
    /** Entitlements decided at check-in. */
    warrantyValid: boolean().notNull(),
    freeService: boolean().notNull(),
    deliveredAt: timestamp({ withTimezone: true }),
    status: text({ enum: VISIT_STATES }).notNull().default('open'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    // One live visit per vehicle anywhere in the group; one visit per scheduled service.
    uniqueIndex('visit_vehicle_live_uq').on(t.vehicleId).where(sql`${t.status} in ('open', 'in_progress', 'ready')`),
    uniqueIndex('visit_schedule_entry_uq').on(t.scheduleEntryId).where(sql`${t.scheduleEntryId} is not null and ${t.status} <> 'cancelled'`),
    check('visit_odometer', sql`${t.odometerKm} >= 0`),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.vehicleId),
    index().on(t.customerId),
    index().on(t.advisorId),
    index().on(t.scheduleEntryId),
    index().on(t.arrivedAt),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

export const jobCard = serviceSchema.table(
  'job_card',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    jobCardNo: text().notNull().unique(),
    visitId: bigintId()
      .notNull()
      .unique()
      .references(() => visit.id),
    vehicleId: bigintId()
      .notNull()
      .references(() => vehicle.id),
    advisorId: bigintId()
      .notNull()
      .references(() => user.id),
    technicianId: bigintId().references(() => user.id),
    notes: text(),
    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    status: text({ enum: JOB_CARD_STATES }).notNull().default('open'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.vehicleId),
    index().on(t.advisorId),
    index().on(t.technicianId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

export const jobCardLine = serviceSchema.table(
  'job_card_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    jobCardId: bigintId()
      .notNull()
      .references(() => jobCard.id, { onDelete: 'cascade' }),
    kind: text({ enum: LINE_KINDS }).notNull(),
    description: text().notNull(),
    /** Part number (linked to parts inventory in phase 5). */
    partNo: text(),
    quantity: qty().notNull(),
    unitPrice: money().notNull(),
    amount: money().notNull(),
    /** False for free/warranty work: done, but not charged to the customer. */
    billable: boolean().notNull().default(true),
    /** 'parts' lines are issued from stock via a parts request (see parts module). */
    source: text({ enum: ['schedule', 'estimate', 'manual', 'parts'] }).notNull().default('manual'),
    estimateLineId: bigintId(),
    status: text({ enum: ['pending', 'done'] }).notNull().default('pending'),
    doneById: bigintId().references(() => user.id),
    doneAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('job_card_line_amounts', sql`${t.quantity} > 0 and ${t.unitPrice} >= 0`),
    index().on(t.dealershipId),
    index().on(t.jobCardId),
    index().on(t.estimateLineId),
    index().on(t.doneById),
    tenantPolicy(),
  ],
);

export const inspection = serviceSchema.table(
  'inspection',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    jobCardId: bigintId()
      .notNull()
      .unique()
      .references(() => jobCard.id),
    inspectorId: bigintId()
      .notNull()
      .references(() => user.id),
    notes: text(),
    completedAt: timestamp({ withTimezone: true }),
    status: text({ enum: INSPECTION_STATES }).notNull().default('in_progress'),
    ...trackedColumns(),
  },
  (t) => [branchFk(t), index().on(t.dealershipId), index().on(t.branchId), index().on(t.inspectorId), ...trackedIndexes(t), tenantPolicy()],
);

export const inspectionItem = serviceSchema.table(
  'inspection_item',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    inspectionId: bigintId()
      .notNull()
      .references(() => inspection.id, { onDelete: 'cascade' }),
    area: text().notNull(),
    item: text().notNull(),
    condition: text({ enum: CONDITIONS }).notNull().default('not_checked'),
    notes: text(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index().on(t.dealershipId), index().on(t.inspectionId), tenantPolicy()],
);

export const estimate = serviceSchema.table(
  'estimate',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    estimateNo: text().notNull().unique(),
    jobCardId: bigintId()
      .notNull()
      .references(() => jobCard.id),
    customerId: bigintId()
      .notNull()
      .references(() => customer.id),
    /** Owner for view_own (the visit's advisor). */
    advisorId: bigintId()
      .notNull()
      .references(() => user.id),
    totalAmount: money().notNull().default('0'),
    validUntil: date({ mode: 'string' }),
    notes: text(),
    status: text({ enum: ESTIMATE_STATES }).notNull().default('draft'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.jobCardId),
    index().on(t.customerId),
    index().on(t.advisorId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

export const estimateLine = serviceSchema.table(
  'estimate_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    estimateId: bigintId()
      .notNull()
      .references(() => estimate.id, { onDelete: 'cascade' }),
    kind: text({ enum: LINE_KINDS }).notNull(),
    description: text().notNull(),
    partNo: text(),
    quantity: qty().notNull(),
    unitPrice: money().notNull(),
    amount: money().notNull(),
    inspectionItemId: bigintId().references(() => inspectionItem.id),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check('estimate_line_amounts', sql`${t.quantity} > 0 and ${t.unitPrice} >= 0`),
    index().on(t.dealershipId),
    index().on(t.estimateId),
    index().on(t.inspectionItemId),
    tenantPolicy(),
  ],
);
