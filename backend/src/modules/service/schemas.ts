import { DiscountPercent, Id, Money, Timestamp, z } from '../../lib/zod';
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
  /** The scheduled service it is (e.g. "Free check-up (1,000 km)"), from the schedule. */
  serviceName: z.string().nullable().optional(),
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

/** Services due: the call list. */
export const ServicesDueQuery = z.object({
  dealershipId: z.coerce.number().int().positive().optional(),
  /** Due within this many days from today (overdue ones are always included). */
  days: z.coerce.number().int().min(0).max(365).default(30),
  overdueOnly: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  uncalledOnly: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});
const ReminderLastCall = z.object({ outcome: z.string(), remarks: z.string().nullable(), nextCallOn: z.string().nullable(), at: Timestamp, by: z.string().nullable() });
export const ServiceDueRowSchema = z
  .object({
    scheduleId: Id,
    service: z.string(),
    dueDate: z.string(),
    dueKm: z.number().int(),
    isFree: z.boolean(),
    overdue: z.boolean(),
    vehicleId: Id,
    registrationNo: z.string().nullable(),
    vin: z.string().nullable(),
    modelName: z.string().nullable(),
    lastOdometerKm: z.number().int().nullable(),
    customerId: Id,
    customerName: z.string(),
    mobile: z.string(),
    dealershipId: Id,
    dealershipName: z.string(),
    callCount: z.number().int(),
    lastCall: ReminderLastCall.nullable(),
  })
  .openapi('ServiceDueRow');
export const ServicesDueSchema = z.object({ items: z.array(ServiceDueRowSchema), total: z.number().int(), overdue: z.number().int() }).openapi('ServicesDue');
export const REMINDER_OUTCOMES = ['booked', 'will_come', 'call_later', 'no_answer', 'wrong_number', 'not_interested', 'already_serviced'] as const;
export const ReminderCallBody = z
  .object({
    scheduleId: Id,
    outcome: z.enum(REMINDER_OUTCOMES),
    remarks: optionalText(1000),
    /** Booked / will come: the day; call later: the day to call again. */
    nextCallOn: z.iso.date().nullish(),
  })
  .openapi('ReminderCallRequest');
export const ReminderCallSchema = z
  .object({ id: Id, outcome: z.string(), remarks: z.string().nullable(), nextCallOn: z.string().nullable(), at: Timestamp, by: z.string().nullable() })
  .openapi('ReminderCall');

/** A customer of the dealership found at check-in, with the cars they own. */
export const CheckInCustomerSchema = z
  .object({
    customerId: Id,
    fullName: z.string(),
    mobile: z.string().nullable(),
    cnic: z.string().nullable(),
    vehicles: z.array(z.object({ vehicleId: Id, registrationNo: z.string().nullable(), vin: z.string().nullable(), modelName: z.string().nullable() })),
  })
  .openapi('CheckInCustomer');

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
    /** The car: its identity, and where it came from (delivered by us, or bought elsewhere). */
    vehicle: z.object({ registrationNo: z.string().nullable(), vin: z.string().nullable(), modelName: z.string().nullable(), variant: z.string().nullable(), color: z.string().nullable(), modelYear: z.number().int().nullable() }),
    delivered: z
      .object({
        on: z.string(),
        odometerKm: z.number().int().nullable(),
        soldBy: z.string().nullable(),
        warrantyEndsOn: z.string().nullable(),
        /** The sales record: order, PBO, salesperson, the buyer, the engine number. */
        orderNo: z.string().nullable().optional(),
        pboNo: z.string().nullable().optional(),
        salesperson: z.string().nullable().optional(),
        boughtBy: z.string().nullable().optional(),
        engineNo: z.string().nullable().optional(),
      })
      .nullable(),
    boughtElsewhere: z.boolean(),
    warrantyEndsOn: z.string().nullable(),
    /** Earlier visits of this car at the dealerships the caller sees, newest first. */
    previousVisits: z.array(z.object({ id: Id, visitNo: z.string(), arrivedAt: Timestamp, odometerKm: z.number().int(), serviceNumber: z.number().int().nullable(), serviceName: z.string().nullable(), visitType: z.string(), freeService: z.boolean(), status: z.string(), complaints: z.string().nullable() })),
  })
  .openapi('VisitPreview');

/**
 * A car that came for service but is not in the system (bought from another dealership): its owner and the car
 * are recorded at check-in, so the visit and its job card can start.
 */
export const RegisterVehicleBody = z
  .object({
    dealershipId: Id,
    customer: z.object({
      fullName: z.string().trim().min(2).max(120),
      mobile: z.string().trim().min(10).max(20),
      cnic: z.string().trim().max(20).nullish(),
      address: optionalText(300),
      city: optionalText(80),
    }),
    vehicle: z.object({
      vin: z.string().trim().min(5).max(40),
      engineNo: z.string().trim().max(40).nullish(),
      registrationNo: z.string().trim().max(40).nullish(),
      modelId: Id,
      variant: optionalText(80),
      color: optionalText(40),
      modelYear: z.number().int().min(1950).max(2100).nullish(),
    }),
    /** Where it was bought (another dealership / showroom). */
    boughtFrom: optionalText(120),
    /** When its warranty ends, if known (free services and warranty visits depend on it). */
    warrantyEndsOn: z.iso.date().nullish(),
    odometerKm: z.number().int().min(0).max(2_000_000).nullish(),
  })
  .openapi('RegisterVehicleRequest');
export const RegisterVehicleResultSchema = z
  .object({ vehicleId: Id, customerId: Id, customerName: z.string(), vehicleLabel: z.string(), alreadyInSystem: z.boolean() })
  .openapi('RegisterVehicleResult');

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
  /** A discount on the line, in percent (the amount is the price x quantity less this). */
  discountPercent: DiscountPercent.optional(),
};
export const JobCardLineSchema = z.object({
  id: Id,
  jobCardId: Id,
  kind: z.enum(LINE_KINDS),
  description: z.string(),
  partNo: z.string().nullable(),
  quantity: z.string(),
  unitPrice: z.string(),
  discountPercent: z.string(),
  amount: z.string(),
  billable: z.boolean(),
  source: z.enum(['schedule', 'estimate', 'manual', 'parts']),
  status: z.enum(['pending', 'done']),
  doneAt: Timestamp.nullable(),
});
/** Left out: free for the labour of a free service visit, charged otherwise (parts and oil are always charged unless set). */
export const JobCardLineCreate = z.object({ ...lineFields, billable: z.boolean().optional() }).openapi('JobCardLineCreate');
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
  discountPercent: z.string(),
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
