import { BoolQuery, Id, Money, Timestamp, z } from '../../lib/zod';
import { VEHICLE_STATUSES } from '../master/models';
import { normalizeCnic, normalizeMobile } from '../master/normalize';
import {
  DELIVERY_DOCUMENTS,
  PDI_CHECKLIST,
  DELIVERY_STATES,
  FOLLOW_UP_OUTCOMES,
  LEAD_SOURCES,
  LEAD_STATES,
  ORDER_STATES,
  ORDER_TYPES,
  PAYMENT_INSTRUMENTS,
  DOCUMENT_KINDS,
  PPF_HIDEABLE_FIELDS,
  PPF_VOUCHER_FIELDS,
  PPF_COVERAGES,
  PPF_FINISHES,
  VEHICLE_PIPELINE,
} from './models';

const optionalText = (max = 200) => z.string().trim().max(max).nullish();
const requiredText = (label: string, max = 120) => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);
const isoDate = z.iso.date();
const mobile = z
  .string({ error: 'Phone number is required' })
  .trim()
  .max(30)
  .refine((v) => normalizeMobile(v) !== null, 'Enter a valid phone number, e.g. 03001234567');
const email = z.email('Enter a valid email address').trim().toLowerCase().max(200);

// ---- Leads --------------------------------------------------------------------
export const LeadSchema = z.object({
  id: Id,
  dealershipId: Id,
  branchId: Id.nullable(),
  ownerId: Id,
  ownerName: z.string().nullable().optional(),
  customerId: Id.nullable(),
  prospectName: z.string(),
  prospectMobile: z.string(),
  email: z.string().nullable(),
  source: z.enum(LEAD_SOURCES),
  interestedModelId: Id.nullable(),
  modelName: z.string().nullable().optional(),
  variant: z.string().nullable(),
  preferredColor: z.string().nullable(),
  expectedCloseDate: z.string().nullable(),
  /** When the customer can expect the car: a date, or a month (stored as its last day). */
  expectedDeliveryDate: z.string().nullable().optional(),
  expectedDeliveryByMonth: z.boolean().optional(),
  notes: z.string().nullable(),
  paymentInstrument: z.enum(PAYMENT_INSTRUMENTS).nullable(),
  paymentInstrumentRef: z.string().nullable(),
  paymentInstrumentBank: z.string().nullable(),
  paymentAmount: z.string().nullable(),
  followUpCount: z.number().int(),
  lastFollowUpAt: Timestamp.nullable(),
  escalatedAt: Timestamp.nullable(),
  escalatedById: Id.nullable(),
  escalatedByName: z.string().nullable().optional(),
  escalationNote: z.string().nullable(),
  convertedAt: Timestamp.nullable(),
  convertedById: Id.nullable(),
  convertedByName: z.string().nullable().optional(),
  status: z.enum(LEAD_STATES),
  salesOrderId: Id.nullable(),
  orderNo: z.string().nullable().optional(),
  /** Where the car on the lead's sales order is (booked, in_transit, received, ready_for_delivery, hold…); null until a car is on it. */
  vehicleStage: z.string().nullable().optional(),
  /** Who entered the lead: its salesperson, or a team leader who logged it for them. */
  createdById: Id.nullable(),
  createdByName: z.string().nullable().optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

/**
 * Walk-in / first contact: name, phone and the model are required; the rest can be filled in later.
 * Variant, colour and email become required at conversion (ConvertLeadBody).
 */
const leadFields = {
  prospectName: requiredText('Customer name'),
  prospectMobile: mobile,
  email: email.nullish().or(z.literal('').transform(() => null)),
  source: z.enum(LEAD_SOURCES).default('walk_in'),
  interestedModelId: Id,
  /** A variant code's description (Hyundai) or free text; required at conversion. */
  variant: optionalText(160),
  preferredColor: optionalText(40),
  expectedCloseDate: isoDate.nullish(),
  notes: optionalText(2000),
};
export const LeadCreate = z
  .object({
    dealershipId: Id,
    branchId: Id.nullish(),
    ...leadFields,
    /** Team leaders (who see every lead) can log a lead for a salesperson; default: yourself. */
    ownerId: Id.optional(),
  })
  .openapi('LeadCreate');
export const LeadUpdate = z
  .object({ ...leadFields, source: leadFields.source.optional(), branchId: Id.nullish(), ownerId: Id.optional() })
  .partial()
  .openapi('LeadUpdate');
 
/**
 * Correcting customer details, including after conversion (the owner or the Sales Admin). The model
 * and payment details stay as converted: the sales order is built on them.
 */
export const LeadDetailsBody = z
  .object({
    prospectName: leadFields.prospectName.optional(),
    prospectMobile: mobile.optional(),
    email: leadFields.email,
    preferredColor: optionalText(40),
    variant: requiredText('Variant', 160).optional(),
    notes: optionalText(2000),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Change at least one detail' })
  .openapi('LeadDetailsRequest');

// ---- Customer documents: vehicle quotation and Paint Protection Film (PPF) form -----------------
/** Who created / last changed a document (shown on it and in its history). */
const docTrail = {
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdById: Id.nullable(),
  createdByName: z.string().nullable().optional(),
  updatedById: Id.nullable(),
  updatedByName: z.string().nullable().optional(),
};

export const QuotationSchema = z.object({
  id: Id,
  dealershipId: Id,
  branchId: Id.nullable(),
  quotationNo: z.string(),
  leadId: Id,
  customerName: z.string().nullable().optional(),
  ownerId: Id,
  ownerName: z.string().nullable().optional(),
  modelId: Id,
  modelName: z.string().nullable().optional(),
  variantCode: z.string().nullable(),
  billTo: z.string().nullable(),
  variant: z.string().nullable(),
  color: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  discount: z.string(),
  freightInsurance: z.string(),
  withholdingTax: z.string(),
  withholdingTaxNonFiler: z.string().nullable(),
  totalAmount: z.string(),
  bookingAmount: z.string().nullable(),
  validUntil: z.string(),
  deliveryDays: z.number().int().nullable(),
  /** Free text (Jetour: "ONE MONTH AFTER FULL PAYMENT."), printed instead of the days when given. */
  deliveryPeriod: z.string().nullable(),
  paymentMode: z.string().nullable(),
  notes: z.string().nullable(),
  ...docTrail,
});

export const VehicleVariantSchema = z
  .object({
    id: Id,
    dealershipId: Id,
    modelId: Id.nullable(),
    modelName: z.string().nullable().optional(),
    code: z.string(),
    description: z.string(),
    isActive: z.boolean(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi('VehicleVariant');
const variantCode = z.string().trim().min(2).max(40).transform((v) => v.toUpperCase().replace(/\s+/g, ''));
const variantDescription = z.string().trim().min(2).max(160);
export const VehicleVariantCreate = z
  .object({ dealershipId: Id, code: variantCode, description: variantDescription, modelId: Id.nullish(), isActive: z.boolean().default(true) })
  .openapi('VehicleVariantCreate');
export const VehicleVariantUpdate = z
  .object({ code: variantCode, description: variantDescription, modelId: Id.nullable(), isActive: z.boolean() })
  .partial()
  .openapi('VehicleVariantUpdate');
/** Rows pasted from Excel (Code / Description). */
export const VariantImportBody = z
  .object({ dealershipId: Id, rows: z.array(z.object({ code: variantCode, description: variantDescription })).min(1).max(500) })
  .openapi('VariantImport');
export const VariantImportResultSchema = z
  .object({ added: z.number().int(), updated: z.number().int(), unchanged: z.number().int() })
  .openapi('VariantImportResult');

/** Fields both issuing and correcting a quotation accept. */
const quotationTerms = {
  /** Picked from the dealership's variant codes (Hyundai); its description becomes the variant. */
  variantCode: z.string().trim().max(40).nullish(),
  billTo: optionalText(200),
  quantity: z.number().int().min(1).max(50),
  freightInsurance: Money,
  withholdingTax: Money,
  withholdingTaxNonFiler: Money.nullish(),
  deliveryDays: z.number().int().min(0).max(365).nullish(),
  deliveryPeriod: optionalText(120),
  paymentMode: optionalText(80),
};
/**
 * Issuing a quotation from a lead. The vehicle comes from the lead; the price is what the salesperson
 * quotes (defaults to the sales order's price once one exists). Discount follows the order policy.
 */
export const QuotationCreate = z
  .object({
    unitPrice: Money.optional(),
    discount: Money.optional(),
    bookingAmount: Money.nullish(),
    /** The vehicle quoted, when it differs from the lead's (a picked variant code sets it too). */
    modelId: Id.optional(),
    /** Typed when no code fits ("Other"); a picked code's description takes its place. */
    variant: optionalText(160),
    color: optionalText(40),
    validDays: z.number().int().min(1).max(60).default(7),
    notes: optionalText(1000),
    ...quotationTerms,
    quantity: quotationTerms.quantity.default(1),
    freightInsurance: Money.default('0'),
    withholdingTax: Money.default('0'),
  })
  .openapi('QuotationCreate');
export const QuotationUpdate = z
  .object({
    unitPrice: Money,
    discount: Money,
    bookingAmount: Money.nullable(),
    variant: optionalText(160),
    color: optionalText(40),
    validUntil: isoDate,
    notes: optionalText(1000),
    ...quotationTerms,
  })
  .partial()
  .openapi('QuotationUpdate');

/** The lead's sales order details a PPF voucher takes (null until known). */
export const LeadOrderVehicleSchema = z.object({ orderNo: z.string().nullable(), pboNo: z.string().nullable(), chassisNo: z.string().nullable(), engineNo: z.string().nullable() }).openapi('LeadOrderVehicle');

export const PpfFormSchema = z.object({
  id: Id,
  dealershipId: Id,
  branchId: Id.nullable(),
  formNo: z.string(),
  leadId: Id,
  customerName: z.string().nullable().optional(),
  ownerId: Id,
  ownerName: z.string().nullable().optional(),
  pboNo: z.string().nullable(),
  chassisNo: z.string().nullable(),
  engineNo: z.string().nullable(),
  coverage: z.enum(PPF_COVERAGES),
  coverageDetails: z.string().nullable(),
  filmBrand: z.string().nullable(),
  finish: z.enum(PPF_FINISHES),
  warrantyYears: z.number().int().nullable(),
  amount: z.string(),
  discount: z.string(),
  totalAmount: z.string(),
  advancePaid: z.string(),
  installationDate: z.string().nullable(),
  notes: z.string().nullable(),
  /** The dealership's own voucher fields, by name. */
  extraFields: z.record(z.string(), z.string()),
  ...docTrail,
});
const ppfFields = {
  pboNo: optionalText(40),
  chassisNo: optionalText(40),
  engineNo: optionalText(40),
  coverage: z.enum(PPF_COVERAGES),
  coverageDetails: optionalText(500),
  filmBrand: optionalText(80),
  finish: z.enum(PPF_FINISHES),
  warrantyYears: z.number().int().min(0).max(15).nullish(),
  amount: Money,
  discount: Money,
  advancePaid: Money,
  installationDate: isoDate.nullish(),
  notes: optionalText(1000),
  /** Values for the dealership's own voucher fields (PPF format), by field name. */
  extraFields: z.record(z.string().trim().max(40), z.string().trim().max(200)).optional(),
};
/** The customer agreed to Paint Protection Film: what is covered and what it costs. */
export const PpfFormCreate = z
  .object({ ...ppfFields, finish: ppfFields.finish.default('gloss'), discount: Money.default('0'), advancePaid: Money.default('0') })
  .openapi('PpfFormCreate');
export const PpfFormUpdate = z.object(ppfFields).partial().openapi('PpfFormUpdate');

/** Everything printed on a document (dealership, customer, consultant, vehicle, who created / changed it). */
const documentParties = {
  issuedAt: Timestamp,
  dealership: z.object({ name: z.string(), code: z.string(), brand: z.string(), address: z.string().nullable(), city: z.string().nullable(), phone: z.string().nullable() }),
  customer: z.object({ name: z.string(), mobile: z.string(), email: z.string().nullable() }),
  salesperson: z.object({ name: z.string(), phone: z.string().nullable(), email: z.string() }),
  vehicle: z.object({ model: z.string(), variant: z.string().nullable(), color: z.string().nullable(), vin: z.string().nullable(), engineNo: z.string().nullable() }),
  orderNo: z.string().nullable(),
  createdByName: z.string().nullable(),
  updatedByName: z.string().nullable(),
  updatedAt: Timestamp,
  notes: z.string().nullable(),
};
/**
 * A dealership's quotation format. Lines may use **bold** and the placeholders {vehicle},
 * {nonFilerTax}, {validityDays}, {deliveryStation}, {dealership}; a line starting "[Hybrid only]"
 * prints only for hybrid vehicles, and a line with {nonFilerTax} only when that amount is set.
 */
const templateLines = (max: number) => z.array(z.string().trim().min(1).max(600)).max(max);
const templateFields = {
  companyName: z.string().trim().min(2).max(120),
  refPrefix: optionalText(12),
  tagline: optionalText(120),
  address: optionalText(200),
  phone: optionalText(80),
  email: optionalText(120),
  deliveryNotes: templateLines(10),
  deliveryStation: optionalText(120),
  defaultPaymentMode: optionalText(80),
  defaultValidityDays: z.number().int().min(1).max(60),
  defaultDeliveryDays: z.number().int().min(0).max(365).nullish(),
  highlightLine: optionalText(200),
  standardEquipment: optionalText(120),
  terms: templateLines(40),
  closingLines: templateLines(10),
  signOff: templateLines(4),
  /** PPF voucher only: title, renamed labels (by field), fields left off, the dealership's own fields. */
  title: optionalText(80),
  fieldLabels: z
    .record(z.string(), z.string().trim().min(1).max(40))
    .refine((r) => Object.keys(r).every((k) => (PPF_VOUCHER_FIELDS as readonly string[]).includes(k)), { message: 'Unknown voucher field' })
    .default({}),
  hiddenFields: z.array(z.enum(PPF_HIDEABLE_FIELDS)).max(PPF_HIDEABLE_FIELDS.length).default([]),
  customFields: z
    .array(z.string().trim().min(1).max(40))
    .max(10)
    .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, { message: 'Each field name only once' })
    .default([]),
};
export const DocumentTemplateSchema = z
  .object({
    dealershipId: Id,
    kind: z.enum(DOCUMENT_KINDS),
    ...templateFields,
    /** True while the dealership still uses the built-in format (never edited). */
    isDefault: z.boolean(),
    updatedAt: Timestamp.nullable(),
    updatedByName: z.string().nullable(),
  })
  .openapi('DocumentTemplate');
export const DocumentTemplateBody = z.object({ dealershipId: Id, ...templateFields }).openapi('DocumentTemplateUpdate');
export const DocumentTemplateQuery = z.object({ dealershipId: z.coerce.number().int().positive() });
export const DocumentKindParam = z.object({ kind: z.enum(DOCUMENT_KINDS) });

export const QuotationDocumentSchema = z
  .object({
    quotationNo: z.string(),
    validUntil: z.string(),
    variantCode: z.string().nullable(),
    billTo: z.string().nullable(),
    deliveryDays: z.number().int().nullable(),
    deliveryPeriod: z.string().nullable(),
    paymentMode: z.string().nullable(),
    /** The dealership's current quotation format. */
    template: DocumentTemplateSchema,
    ...documentParties,
    pricing: z.object({
      quantity: z.number().int(),
      unitPrice: z.string(),
      discount: z.string(),
      freightInsurance: z.string(),
      withholdingTax: z.string(),
      withholdingTaxNonFiler: z.string().nullable(),
      total: z.string(),
      bookingAmount: z.string().nullable(),
    }),
  })
  .openapi('QuotationDocument');
export const PpfDocumentSchema = z
  .object({
    formNo: z.string(),
    /** The form's PBO number, else the sales order's. */
    pboNo: z.string().nullable(),
    /** Letterhead (the dealership's quotation format). */
    template: DocumentTemplateSchema,
    /** The voucher's own format: title, field labels, hidden / extra fields, notes, sign lines. */
    ppfTemplate: DocumentTemplateSchema,
    extraFields: z.record(z.string(), z.string()),
    ...documentParties,
    coverage: z.enum(PPF_COVERAGES),
    coverageDetails: z.string().nullable(),
    filmBrand: z.string().nullable(),
    finish: z.enum(PPF_FINISHES),
    warrantyYears: z.number().int().nullable(),
    installationDate: z.string().nullable(),
    pricing: z.object({ amount: z.string(), discount: z.string(), total: z.string(), advancePaid: z.string(), balance: z.string() }),
  })
  .openapi('PpfDocument');

export const LeadFollowUpSchema = z
  .object({
    id: Id,
    leadId: Id,
    outcome: z.enum(FOLLOW_UP_OUTCOMES),
    remarks: z.string().nullable(),
    createdById: Id,
    createdByName: z.string().nullable(),
    createdAt: Timestamp,
  })
  .openapi('LeadFollowUp');
export const LeadFollowUpCreate = z
  .object({ outcome: z.enum(FOLLOW_UP_OUTCOMES), remarks: optionalText(2000) })
  .openapi('LeadFollowUpCreate');

/** "Convert to Lead": the qualifying details required before the Admin can raise the order. */
export const ConvertLeadBody = z
  .object({
    /** The customer's name and phone can be corrected while converting (a new phone is checked for duplicates). */
    prospectName: requiredText('Customer name').optional(),
    prospectMobile: mobile.optional(),
    interestedModelId: Id,
    preferredColor: requiredText('Vehicle colour', 40),
    variant: requiredText('Variant', 160),
    email,
    paymentInstrument: z.enum(PAYMENT_INSTRUMENTS),
    paymentInstrumentRef: requiredText('Payment instrument number', 60),
    paymentInstrumentBank: optionalText(80),
    paymentAmount: Money.nullish(),
    /** Expected delivery told to the customer (carried to the sales order): a date, or a month. */
    expectedDeliveryDate: isoDate.nullish(),
    expectedDeliveryByMonth: z.boolean().optional(),
    /** The customer's CNIC (required): saved on the customer; the Admin checks it against the copy. */
    customerCnic: z
      .string({ error: "Enter the customer's CNIC" })
      .trim()
      .max(20)
      .refine((v) => normalizeCnic(v) !== null, 'CNIC must be 13 digits, e.g. 35202-1234567-1'),
    notes: optionalText(2000),
  })
  .openapi('ConvertLeadRequest');

/** A salesperson hit a duplicate phone number: flag the existing lead for the Assistant Manager. */
export const EscalateDuplicateBody = z
  .object({ dealershipId: Id, prospectMobile: mobile, note: optionalText(500) })
  .openapi('EscalateDuplicateRequest');
export const EscalationResultSchema = z.object({ leadId: Id, escalatedAt: Timestamp }).openapi('EscalationResult');

/** The Admin raises the sales order from a converted lead. */
export const RaiseOrderBody = z
  .object({
    orderType: z.enum(ORDER_TYPES).default('pbo'),
    /** The PBO number from the head-office system (required). */
    pboNo: requiredText('PBO number', 40),
    branchId: Id.nullish(),
    unitPrice: Money,
    discount: Money.default('0'),
    bookingAmount: Money.nullish(),
    paymentReference: optionalText(80),
    /**
     * The customer's CNIC: required on every sales order. Empty when the customer already has one;
     * a new or corrected CNIC is saved on the customer.
     */
    customerCnic: z
      .string()
      .trim()
      .max(20)
      .optional()
      .refine((v) => !v || normalizeCnic(v) !== null, 'CNIC must be 13 digits, e.g. 35202-1234567-1'),
    /** Empty: from the lead (what the salesperson told the customer). */
    expectedDeliveryDate: isoDate.nullish(),
    /** The expected delivery is a month (the date is its last day), not an exact date. */
    expectedDeliveryByMonth: z.boolean().optional(),
    notes: optionalText(2000),
  })
  .openapi('RaiseOrderRequest');

// ---- Team report (Sales Manager) -------------------------------------------------------------
const trackCounts = {
  leadsLogged: z.number().int(),
  /** Leads converted (credited to the lead's salesperson), before any order is raised. */
  converted: z.number().int(),
  carsBooked: z.number().int(),
  carsDelivered: z.number().int(),
  ppfSold: z.number().int(),
  ppfAmount: z.string(),
  ppfAdvance: z.string(),
  quotations: z.number().int(),
};
/** A lead in the track record details (logged or converted in the period). */
const TrackLeadRow = z.object({
  userId: Id,
  customer: z.string(),
  phone: z.string(),
  vehicle: z.string().nullable(),
  source: z.string(),
  status: z.string(),
  loggedOn: z.string(),
  convertedOn: z.string().nullable(),
  /** Who entered the lead (e.g. the Assistant Manager for a salesperson) and who converted it. */
  enteredBy: z.string().nullable(),
  convertedBy: z.string().nullable(),
});
// ---- Delivery pipeline (Deliveries page) ----------------------------------------------------------
const PIPELINE_STAGE = z.enum(['waiting', 'in_transit', 'received', 'scheduled', 'delivered']);
export const DeliveryPipelineQuery = z
  .object({
    stage: PIPELINE_STAGE.optional(),
    dealershipId: z.coerce.number().int().positive().optional(),
    /** Order number, customer name, chassis or engine number. */
    q: z.string().trim().max(100).optional(),
    /** Only orders past their expected delivery whose car has not arrived. */
    overdue: BoolQuery.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .openapi('DeliveryPipelineQuery');
export const DeliveryPipelineSchema = z
  .object({
    stage: PIPELINE_STAGE,
    counts: z.object({ waiting: z.number().int(), in_transit: z.number().int(), received: z.number().int(), scheduled: z.number().int(), delivered: z.number().int() }),
    items: z.array(
      z.object({
        orderId: Id,
        orderNo: z.string(),
        pboNo: z.string().nullable(),
        orderStatus: z.string(),
        leadId: Id.nullable(),
        dealershipId: Id,
        dealershipName: z.string(),
        customerName: z.string().nullable(),
        salespersonName: z.string().nullable(),
        model: z.string().nullable(),
        variant: z.string().nullable(),
        color: z.string().nullable(),
        vehicleId: Id.nullable(),
        chassisNo: z.string().nullable(),
        engineNo: z.string().nullable(),
        vehicleStatus: z.string().nullable(),
        deliveryId: Id.nullable(),
        deliveryNo: z.string().nullable(),
        scheduledDate: z.string().nullable(),
        deliveredOn: z.string().nullable(),
        approvedAt: z.string().nullable(),
        expectedDeliveryDate: z.string().nullable(),
        expectedDeliveryByMonth: z.boolean(),
        bookedAt: z.string(),
        stage: PIPELINE_STAGE,
      }),
    ),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .openapi('DeliveryPipeline');

// ---- Delivery report --------------------------------------------------------------------------------
export const DeliveryReportQuery = z
  .object({
    /** One dealership; omitted = every dealership the caller sees, and all together. */
    dealershipId: z.coerce.number().int().positive().optional(),
    /** The chosen period (default: this month). */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((q) => !q.from === !q.to, { message: 'Give both a start and an end date', path: ['from'] })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'The start date must be on or before the end date', path: ['from'] })
  .openapi('DeliveryReportQuery');
const DeliveryCounts = {
  thisMonth: z.number().int(),
  thisYear: z.number().int(),
  last30Days: z.number().int(),
  allTime: z.number().int(),
  inPeriod: z.number().int(),
  scheduled: z.number().int(),
  /** Average days from the order's approval to delivery (cars delivered in the period). */
  avgDaysToDeliver: z.number().nullable(),
};
export const DeliveryReportSchema = z
  .object({
    asOf: z.string(),
    period: z.object({ from: z.string(), to: z.string() }),
    dealerships: z.array(z.object({ id: Id, code: z.string(), name: z.string(), brand: z.string(), ...DeliveryCounts })),
    total: z.object(DeliveryCounts),
    byModel: z.array(z.object({ brand: z.string(), model: z.string(), delivered: z.number().int(), avgDaysToDeliver: z.number().nullable() })),
    /** Per month of the period: orders booked (not cancelled) and cars delivered. */
    byMonth: z.array(z.object({ month: z.string(), booked: z.number().int(), delivered: z.number().int() })),
  })
  .openapi('DeliveryReport');

export const TrackRecordQuery = z
  .object({
    dealershipId: z.coerce.number().int().positive(),
    year: z.coerce.number().int().min(2020).max(2100),
    /** 1-12; omitted = the whole year. */
    month: z.coerce.number().int().min(1).max(12).optional(),
    /** A custom period instead of the month / year (the chart still shows the year). */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** One person's record (someone the caller can see). */
    userId: z.coerce.number().int().positive().optional(),
    /** Sales Manager: all Salespersons together, or all CROs together (ignored with `userId`). */
    group: z.enum(['salespeople', 'cros']).optional(),
    /** Also the customers behind the figures (for the downloaded report). */
    details: BoolQuery.optional(),
  })
  .refine((q) => !q.from === !q.to, { message: 'Give both a start and an end date', path: ['from'] })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'The start date must be on or before the end date', path: ['from'] })
  .refine((q) => !q.from || !q.to || (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < 366, { message: 'Choose a period of at most a year', path: ['from'] });
export const TrackRecordSchema = z
  .object({
    dealershipId: Id,
    year: z.number().int(),
    month: z.number().int().nullable(),
    /** The custom period, when one was chosen. */
    from: z.string().nullable(),
    to: z.string().nullable(),
    /** team: everyone (Sales Manager); salespeople: the Salespersons only (Assistant Manager, Sales Admin); own. */
    scope: z.enum(['team', 'salespeople', 'own']),
    /** The people the record can be narrowed to (the filter). */
    people: z.array(
      z.object({
        userId: Id,
        fullName: z.string(),
        /** salesperson / cro; leader = Assistant Manager or a manager with leads of their own in the period. */
        kind: z.enum(['salesperson', 'cro', 'leader']),
      }),
    ),
    userId: Id.nullable(),
    group: z.enum(['salespeople', 'cros']).nullable(),
    totals: z.object(trackCounts),
    members: z.array(z.object({ userId: Id, fullName: z.string(), isActive: z.boolean(), ...trackCounts })),
    months: z.array(z.object({ month: z.string(), ...trackCounts })),
    /** With `details`: the customers behind the figures, per salesperson, in the same period. */
    details: z
      .object({
        leads: z.array(TrackLeadRow),
        converted: z.array(TrackLeadRow),
        ppf: z.array(
          z.object({
            userId: Id,
            formNo: z.string(),
            customer: z.string(),
            phone: z.string(),
            soldOn: z.string(),
            coverage: z.string(),
            price: z.string(),
            paid: z.string(),
            unpaid: z.string(),
          }),
        ),
      })
      .optional(),
  })
  .openapi('TrackRecord');

export const TeamReportQuery = z.object({
  dealershipId: z.coerce.number().int().positive(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export const TeamReportSchema = z
  .object({
    dealershipId: Id,
    period: z.object({ from: z.string(), to: z.string() }),
    totals: z.object({
      leads: z.number().int(),
      walkIns: z.number().int(),
      converted: z.number().int(),
      ordersRaised: z.number().int(),
      ordersCompleted: z.number().int(),
      salespeopleWithOrders: z.number().int(),
    }),
    members: z.array(
      z.object({
        userId: Id,
        fullName: z.string(),
        roles: z.string(),
        leads: z.number().int(),
        walkIns: z.number().int(),
        followUps: z.number().int(),
        converted: z.number().int(),
        escalationsConverted: z.number().int(),
        ordersRaised: z.number().int(),
        ordersCompleted: z.number().int(),
      }),
    ),
    daily: z.array(z.object({ date: z.string(), walkIns: z.number().int(), leads: z.number().int(), converted: z.number().int() })),
  })
  .openapi('SalesTeamReport');
export const TeamMemberSchema = z
  .object({ id: Id, fullName: z.string(), /** A salesperson: converts and sees only their own leads; not a CRO or a manager. */ sellsCars: z.boolean(),
    /** Can be given a lead by a team leader (Salesperson, CRO). */ takesLeads: z.boolean() })
  .openapi('SalesTeamMember');

// ---- Personal dashboard ------------------------------------------------------------
/**
 * One call for a sales user's home page. Every section is computed within the caller's own view
 * scope (own leads, all leads, converted-only, ...) and is omitted when they cannot see that area.
 */
/** Either the last `days` days, or a custom from/to range (Pakistan dates, up to 92 days). */
export const DashboardQuery = z
  .object({
    days: z.coerce.number().int().min(1).max(92).default(14),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** Team views only: one salesperson's leads, orders and deliveries. */
    ownerId: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => !q.from === !q.to, { message: 'Give both a start and an end date', path: ['from'] })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'The start date must be on or before the end date', path: ['from'] })
  .refine((q) => !q.from || !q.to || (Date.parse(q.to) - Date.parse(q.from)) / 86400_000 < 92, { message: 'Choose a range of at most 92 days', path: ['from'] });
const counts = z.record(z.string(), z.number().int());

/** Something waiting for the signed-in person ("Action needed": bell, dashboard panel, pop-up). */
export const ActionItemSchema = z
  .object({
    key: z.string(),
    title: z.string(),
    count: z.number().int(),
    /** The list to open to act on it. */
    to: z.string(),
    /** Needs doing now (e.g. a car ready to hand over); shown first and in the pop-up. */
    urgent: z.boolean(),
  })
  .openapi('ActionItem');

/** Totals above the leads list: the same filters as the list (latest-activity dates, salesperson, source), all statuses. */
export const LeadSummaryQuery = z
  .object({
    activityFrom: z.iso.date().optional(),
    activityTo: z.iso.date().optional(),
    ownerId: z.coerce.number().int().positive().optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    escalated: BoolQuery.optional(),
  })
  .refine((q) => !q.activityFrom || !q.activityTo || q.activityFrom <= q.activityTo, {
    message: 'The start date must be on or before the end date',
    path: ['activityFrom'],
  });
export const LeadSummarySchema = z.object({ total: z.number().int(), byStatus: counts }).openapi('LeadSummary');
export const SalesDashboardSchema = z
  .object({
    period: z.object({ from: z.string(), to: z.string(), days: z.number().int() }),
    leads: z
      .object({
        byStatus: counts,
        /** Every lead in your scope, all time. */
        total: z.number().int(),
        /** Leads logged within the chosen period. */
        loggedInPeriod: z.number().int(),
        open: z.number().int(),
        loggedToday: z.number().int(),
        escalatedOpen: z.number().int(),
        myFollowUpsToday: z.number().int(),
        daily: z.array(z.object({ date: z.string(), logged: z.number().int(), converted: z.number().int() })),
      })
      .optional(),
    orders: z.object({ byStatus: counts, awaitingVehicle: z.number().int() }).optional(),
    stock: z.object({ byStatus: counts, free: z.number().int() }).optional(),
    deliveries: z.object({ scheduled: z.number().int(), deliveredInPeriod: z.number().int() }).optional(),
  })
  .openapi('SalesDashboard');

// ---- Sales orders ------------------------------------------------------------------
export const SalesOrderSchema = z.object({
  id: Id,
  orderNo: z.string(),
  pboNo: z.string().nullable(),
  orderType: z.enum(ORDER_TYPES),
  dealershipId: Id,
  branchId: Id.nullable(),
  legalEntityId: Id.nullable(),
  accountingEntityId: Id.nullable(),
  leadId: Id.nullable(),
  customerId: Id,
  customerName: z.string().optional(),
  salespersonId: Id,
  salespersonName: z.string().optional(),
  modelId: Id,
  modelName: z.string().optional(),
  variant: z.string().nullable(),
  color: z.string().nullable(),
  unitPrice: z.string(),
  discount: z.string(),
  totalAmount: z.string(),
  bookingAmount: z.string(),
  expectedDeliveryDate: z.string().nullable(),
  expectedDeliveryByMonth: z.boolean(),
  vehicleId: Id.nullable(),
  vehicleLabel: z.string().nullable().optional(),
  vehicleStatus: z.enum(VEHICLE_STATUSES).nullable().optional(),
  financingRef: z.string().nullable(),
  paymentReference: z.string().nullable(),
  vehicleVin: z.string().nullable().optional(),
  vehicleEngineNo: z.string().nullable().optional(),
  notes: z.string().nullable(),
  status: z.enum(ORDER_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

const orderFields = {
  pboNo: optionalText(40),
  customerId: Id,
  modelId: Id,
  variant: optionalText(80),
  color: optionalText(40),
  unitPrice: Money,
  discount: Money.default('0'),
  bookingAmount: Money.default('0'),
  expectedDeliveryDate: isoDate.nullish(),
  expectedDeliveryByMonth: z.boolean().optional(),
  salespersonId: Id.optional(),
  /** Bank / leasing reference, for orders financed rather than paid outright. */
  financingRef: optionalText(80),
  paymentReference: optionalText(80),
  orderType: z.enum(ORDER_TYPES).optional(),
  notes: optionalText(2000),
};
export const SalesOrderCreate = z
  .object({ dealershipId: Id, branchId: Id.nullish(), ...orderFields })
  .openapi('SalesOrderCreate');
export const SalesOrderUpdate = z
  .object({ ...orderFields, discount: Money.optional(), bookingAmount: Money.optional(), branchId: Id.nullish() })
  .partial()
  .openapi('SalesOrderUpdate');

/**
 * Vehicle identifiers entered on the order by the Admin when the vehicle is in stock. Any subset:
 * unknown fields stay pending and can be completed later (also by the future Delivery Team).
 */
const identifier = (label: string) =>
  z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') || null : null))
    .refine((v) => v === null || (v.length >= 3 && v.length <= 25), `${label} must be 3-25 letters/digits`);
export const OrderVehicleBody = z
  .object({
    vin: identifier('Chassis number'),
    engineNo: identifier('Engine number'),
    registrationNo: identifier('Registration number'),
    color: optionalText(40),
    modelYear: z.number().int().min(1950).max(2100).nullish(),
  })
  .openapi('OrderVehicleRequest');

// ---- Open stock (Delivery Team) -------------------------------------------------------------
/** A dealership's undelivered vehicle, with the live order holding it (if any). */
export const StockVehicleSchema = z
  .object({
    id: Id,
    vin: z.string().nullable(),
    engineNo: z.string().nullable(),
    registrationNo: z.string().nullable(),
    modelId: Id,
    modelName: z.string().optional(),
    variant: z.string().nullable(),
    color: z.string().nullable(),
    modelYear: z.number().int().nullable(),
    status: z.enum(VEHICLE_STATUSES),
    notes: z.string().nullable(),
    dealershipId: Id.nullable().optional(),
    dealershipName: z.string().nullable().optional(),
    orderId: Id.nullable().optional(),
    orderNo: z.string().nullable().optional(),
    orderStatus: z.enum(ORDER_STATES).nullable().optional(),
    customerName: z.string().nullable().optional(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi('StockVehicle');

const requiredIdentifier = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .max(40)
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .refine((v) => v.length >= 3 && v.length <= 25, `${label} must be 3-25 letters/digits`);
const stockFields = {
  modelId: Id,
  variant: optionalText(160),
  color: optionalText(40),
  modelYear: z.number().int().min(1950).max(2100).nullish(),
  notes: optionalText(2000),
};
/** Registering an incoming vehicle: the chassis and engine numbers are both required. */
export const StockVehicleCreate = z
  .object({
    dealershipId: Id,
    vin: requiredIdentifier('Chassis number'),
    engineNo: requiredIdentifier('Engine number'),
    ...stockFields,
    /** The booked order this car arrived for: linked to it and marked received. Empty: free stock. */
    orderId: Id.nullish(),
  })
  .openapi('StockVehicleCreate');
export const StockVehicleUpdate = z
  .object({ vin: requiredIdentifier('Chassis number'), engineNo: requiredIdentifier('Engine number'), ...stockFields })
  .partial()
  .openapi('StockVehicleUpdate');

export const AllocationBody = z.object({ vehicleId: Id }).openapi('AllocationRequest');
/** Advances the allocated vehicle through logistics (or pauses it on hold); see VEHICLE_PIPELINE. */
export const AdvanceVehicleStatusBody = z.object({ status: z.enum([...VEHICLE_PIPELINE, 'hold']) }).openapi('AdvanceVehicleStatusRequest');
export const AllocatableVehicleSchema = z
  .object({ id: Id, vin: z.string().nullable(), engineNo: z.string().nullable(), registrationNo: z.string().nullable(), variant: z.string().nullable(), color: z.string().nullable(), modelYear: z.number().int().nullable() })
  .openapi('AllocatableVehicle');

// ---- Deliveries ------------------------------------------------------------------------
export const DeliverySchema = z.object({
  id: Id,
  deliveryNo: z.string(),
  dealershipId: Id,
  branchId: Id.nullable(),
  salesOrderId: Id,
  orderNo: z.string().optional(),
  vehicleId: Id,
  vehicleLabel: z.string().optional(),
  customerId: Id,
  customerName: z.string().optional(),
  salespersonId: Id,
  salespersonName: z.string().optional(),
  scheduledDate: z.string(),
  deliveredOn: z.string().nullable(),
  deliveredAt: Timestamp.nullable(),
  odometerKm: z.number().int().nullable(),
  documentsHandedOver: z.array(z.enum(DELIVERY_DOCUMENTS)),
  accessoriesHandedOver: z.array(z.string()),
  /** The pre-delivery checklist ticked at hand-over. */
  checklist: z.array(z.enum(PDI_CHECKLIST)),
  customerAcknowledged: z.boolean(),
  customerAcknowledgedAt: Timestamp.nullable(),
  notes: z.string().nullable(),
  status: z.enum(DELIVERY_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

/** The delivery note: who takes delivery, against which PBO, the vehicle (blank where not known). */
export const DeliveryNoteSchema = z
  .object({
    deliveryNo: z.string(),
    status: z.string(),
    scheduledDate: z.string(),
    deliveredAt: z.string().nullable(),
    dealership: z.object({ name: z.string(), code: z.string(), brand: z.string() }),
    customer: z.object({ name: z.string().nullable(), cnic: z.string().nullable() }),
    pboNo: z.string().nullable(),
    orderNo: z.string().nullable(),
    vehicle: z.object({
      brand: z.string().nullable(),
      model: z.string().nullable(),
      variant: z.string().nullable(),
      color: z.string().nullable(),
      chassisNo: z.string().nullable(),
      engineNo: z.string().nullable(),
    }),
    accessories: z.array(z.string()),
  })
  .openapi('DeliveryNote');

export const ScheduleDeliveryBody = z
  .object({ scheduledDate: isoDate, branchId: Id.nullish(), notes: optionalText(2000) })
  .openapi('ScheduleDeliveryRequest');

export const CompleteDeliveryBody = z
  .object({
    deliveredOn: isoDate.optional(),
    odometerKm: z.number().int().min(0).max(100000),
    /** Registration plate issued at delivery, if any (recorded on the vehicle). */
    registrationNo: z.string().trim().max(40).nullish(),
    documentsHandedOver: z.array(z.enum(DELIVERY_DOCUMENTS)).max(DELIVERY_DOCUMENTS.length).default([]),
    accessoriesHandedOver: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    /** Pre-delivery checklist: every item must be ticked (PDI done, documents ready, accessories fitted). */
    checklist: z
      .array(z.enum(PDI_CHECKLIST))
      .refine((v) => PDI_CHECKLIST.every((i) => v.includes(i)), 'Tick every item of the pre-delivery checklist (PDI done, documents ready, accessories fitted)'),
    /** The customer must confirm receipt to complete the delivery. */
    customerAcknowledged: z.boolean().refine((v) => v, 'The customer must acknowledge receipt to complete the delivery'),
    notes: optionalText(2000),
  })
  .openapi('CompleteDeliveryRequest');
