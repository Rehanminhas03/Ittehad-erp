import { Id, Money, Timestamp, z } from '../../lib/zod';
import { CONDITIONS, ESTIMATE_STATES, INSPECTION_STATES, JOB_CARD_STATES, LINE_KINDS, VISIT_STATES, VISIT_TYPES } from './models';

const optionalText = (max = 200) => z.string().trim().max(max).nullish();
const Quantity = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^\d{1,6}(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Quantity must be greater than 0 (up to 2 decimals)')
  .openapi({ type: 'string', example: '1.5' });

// ---- Configuration ------------------------------------------------------------------
export const ScheduleItemSchema = z.object({
  id: Id,
  modelId: Id,
  modelName: z.string().optional(),
  sequence: z.number().int(),
  name: z.string(),
  dueKm: z.number().int(),
  dueMonths: z.number().int(),
  isFree: z.boolean(),
  labourHours: z.string(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
const scheduleItemFields = {
  modelId: Id,
  sequence: z.number().int().min(1).max(100),
  name: z.string().trim().min(2).max(80),
  dueKm: z.number().int().min(0).max(1_000_000),
  dueMonths: z.number().int().min(0).max(240),
  isFree: z.boolean().default(false),
  labourHours: Quantity.default('1'),
  isActive: z.boolean().optional(),
};
export const ScheduleItemCreate = z.object(scheduleItemFields).openapi('ScheduleItemCreate');
export const ScheduleItemUpdate = z
  .object({ ...scheduleItemFields, isFree: z.boolean().optional(), labourHours: Quantity.optional() })
  .omit({ modelId: true })
  .partial()
  .openapi('ScheduleItemUpdate');

export const InspectionTemplateItemSchema = z.object({
  id: Id,
  area: z.string(),
  item: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const InspectionTemplateItemCreate = z
  .object({ area: z.string().trim().min(2).max(60), item: z.string().trim().min(2).max(120), sortOrder: z.number().int().min(0).max(10000).default(0), isActive: z.boolean().optional() })
  .openapi('InspectionTemplateItemCreate');
export const InspectionTemplateItemUpdate = InspectionTemplateItemCreate.partial().openapi('InspectionTemplateItemUpdate');

// Named schemas stay non-null (zod-to-openapi would otherwise mark the shared component nullable);
// where null is possible, the unnamed base is used with .nullable().
const VehicleScheduleEntryBase = z.object({
  id: Id,
  sequence: z.number().int(),
  name: z.string(),
  dueKm: z.number().int(),
  dueDate: z.string(),
  isFree: z.boolean(),
  status: z.enum(['due', 'done']),
  visitId: Id.nullable(),
  completedOn: z.string().nullable(),
});
export const VehicleScheduleEntrySchema = VehicleScheduleEntryBase.openapi('VehicleScheduleEntry');

// ---- Visits --------------------------------------------------------------------------------
export const VisitSchema = z.object({
  id: Id,
  visitNo: z.string(),
  dealershipId: Id,
  branchId: Id.nullable(),
  vehicleId: Id,
  vehicleLabel: z.string().nullable().optional(),
  customerId: Id,
  customerName: z.string().nullable().optional(),
  advisorId: Id,
  advisorName: z.string().nullable().optional(),
  visitType: z.enum(VISIT_TYPES),
  serviceNumber: z.number().int().nullable(),
  scheduleEntryId: Id.nullable(),
  visitSequence: z.number().int(),
  odometerKm: z.number().int(),
  arrivedAt: Timestamp,
  promisedAt: Timestamp.nullable(),
  complaints: z.string().nullable(),
  warrantyValid: z.boolean(),
  freeService: z.boolean(),
  deliveredAt: Timestamp.nullable(),
  jobCardId: Id.nullable().optional(),
  status: z.enum(VISIT_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const VisitCreate = z
  .object({
    dealershipId: Id,
    branchId: Id.nullish(),
    vehicleId: Id,
    /** Defaults to the vehicle's current owner in this dealership. */
    customerId: Id.nullish(),
    visitType: z.enum(VISIT_TYPES),
    odometerKm: z.number().int().min(0).max(2_000_000),
    promisedAt: z.iso.datetime().nullish(),
    complaints: optionalText(4000),
  })
  .openapi('VisitCreate');
export const VisitUpdate = z
  .object({ promisedAt: z.iso.datetime().nullish(), complaints: optionalText(4000) })
  .partial()
  .openapi('VisitUpdate');

/** What check-in would compute, shown before the visit is created. */
export const VisitPreviewSchema = z
  .object({
    visitSequence: z.number().int(),
    nextScheduled: VehicleScheduleEntryBase.nullable(),
    warrantyValid: z.boolean(),
    freeServiceIfScheduled: z.boolean(),
    lastOdometerKm: z.number().int().nullable(),
    currentOwner: z.object({ customerId: Id, fullName: z.string() }).nullable(),
    openVisitId: Id.nullable(),
  })
  .openapi('VisitPreview');

// ---- Job cards -------------------------------------------------------------------------
export const JobCardSchema = z.object({
  id: Id,
  jobCardNo: z.string(),
  dealershipId: Id,
  branchId: Id.nullable(),
  visitId: Id,
  visitNo: z.string().nullable().optional(),
  vehicleId: Id,
  vehicleLabel: z.string().nullable().optional(),
  advisorId: Id,
  advisorName: z.string().nullable().optional(),
  technicianId: Id.nullable(),
  technicianName: z.string().nullable().optional(),
  notes: z.string().nullable(),
  startedAt: Timestamp.nullable(),
  completedAt: Timestamp.nullable(),
  status: z.enum(JOB_CARD_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const JobCardUpdate = z.object({ technicianId: Id.nullish(), notes: optionalText(4000) }).partial().openapi('JobCardUpdate');

const lineFields = {
  kind: z.enum(LINE_KINDS),
  description: z.string().trim().min(2).max(300),
  partNo: z.string().trim().max(60).nullish(),
  quantity: Quantity,
  unitPrice: Money,
};
export const JobCardLineSchema = z.object({
  id: Id,
  jobCardId: Id,
  kind: z.enum(LINE_KINDS),
  description: z.string(),
  partNo: z.string().nullable(),
  quantity: z.string(),
  unitPrice: z.string(),
  amount: z.string(),
  billable: z.boolean(),
  source: z.enum(['schedule', 'estimate', 'manual', 'parts']),
  status: z.enum(['pending', 'done']),
  doneAt: Timestamp.nullable(),
});
export const JobCardLineCreate = z.object({ ...lineFields, billable: z.boolean().default(true) }).openapi('JobCardLineCreate');
export const JobCardLineUpdate = z.object({ ...lineFields, billable: z.boolean() }).partial().openapi('JobCardLineUpdate');

// ---- Inspections --------------------------------------------------------------------------
export const InspectionItemSchema = z
  .object({ id: Id, area: z.string(), item: z.string(), condition: z.enum(CONDITIONS), notes: z.string().nullable(), sortOrder: z.number().int() })
  .openapi('InspectionItem');
export const InspectionBase = z.object({
  id: Id,
  dealershipId: Id,
  branchId: Id.nullable(),
  jobCardId: Id,
  inspectorId: Id,
  inspectorName: z.string().nullable().optional(),
  notes: z.string().nullable(),
  completedAt: Timestamp.nullable(),
  status: z.enum(INSPECTION_STATES),
  items: z.array(InspectionItemSchema),
});
export const InspectionSchema = InspectionBase.openapi('Inspection');
export const InspectionItemsUpdate = z
  .object({
    items: z
      .array(z.object({ id: Id, condition: z.enum(CONDITIONS), notes: z.string().trim().max(500).nullish() }))
      .min(1)
      .max(200),
    notes: optionalText(4000),
  })
  .openapi('InspectionItemsUpdate');

// ---- Estimates -------------------------------------------------------------------------------
export const EstimateSchema = z.object({
  id: Id,
  estimateNo: z.string(),
  dealershipId: Id,
  branchId: Id.nullable(),
  jobCardId: Id,
  jobCardNo: z.string().nullable().optional(),
  customerId: Id,
  customerName: z.string().nullable().optional(),
  advisorId: Id,
  totalAmount: z.string(),
  validUntil: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(ESTIMATE_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const EstimateCreate = z
  .object({ jobCardId: Id, validUntil: z.iso.date().nullish(), notes: optionalText(4000), fromInspection: z.boolean().default(false) })
  .openapi('EstimateCreate');
export const EstimateUpdate = z.object({ validUntil: z.iso.date().nullish(), notes: optionalText(4000) }).partial().openapi('EstimateUpdate');

export const EstimateLineSchema = z.object({
  id: Id,
  estimateId: Id,
  kind: z.enum(LINE_KINDS),
  description: z.string(),
  partNo: z.string().nullable(),
  quantity: z.string(),
  unitPrice: z.string(),
  amount: z.string(),
  inspectionItemId: Id.nullable(),
  sortOrder: z.number().int(),
});
export const EstimateLineCreate = z
  .object({ ...lineFields, inspectionItemId: Id.nullish(), sortOrder: z.number().int().min(0).max(10000).default(0) })
  .openapi('EstimateLineCreate');
export const EstimateLineUpdate = z
  .object({ ...lineFields, sortOrder: z.number().int().min(0).max(10000) })
  .partial()
  .openapi('EstimateLineUpdate');
