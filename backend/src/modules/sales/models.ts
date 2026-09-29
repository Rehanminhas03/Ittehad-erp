import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, jsonb, numeric, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigintId, pk } from '../../db/columns';
import { salesSchema } from '../../db/pgSchemas';
import { accountingEntity, branchFk, dealership, legalEntity, tenantPolicy, trackedColumns, trackedIndexes, user } from '../core/models';
import { customer, vehicle, vehicleModel } from '../master/models';

const money = () => numeric({ precision: 14, scale: 2, mode: 'string' });

export const LEAD_SOURCES = ['walk_in', 'phone', 'website', 'social', 'referral', 'event', 'other'] as const;
/**
 * new → follow_up / visited (follow-ups recorded) → converted ("Convert to Lead": qualified, visible
 * to Admin) → processing (Admin raised the order) → completed (order delivered).
 * exhausted: given up after at least MIN_FOLLOW_UPS_TO_EXHAUST follow-ups.
 */
export const LEAD_STATES = ['new', 'follow_up', 'visited', 'converted', 'processing', 'completed', 'exhausted'] as const;
/** A phone number can have only one lead in these states per dealership (duplicate control). */
export const ACTIVE_LEAD_STATES = ['new', 'follow_up', 'visited', 'converted', 'processing'] as const;
export const FOLLOW_UP_OUTCOMES = ['interested', 'not_interested', 'visited'] as const;
export const PAYMENT_INSTRUMENTS = ['pay_order', 'bank_draft', 'cheque', 'online_transfer', 'cash'] as const;
export const ORDER_TYPES = ['pbo', 'cbo'] as const;
export const ORDER_STATES = ['draft', 'submitted', 'approved', 'delivered', 'cancelled'] as const;
export const DELIVERY_STATES = ['scheduled', 'delivered', 'cancelled'] as const;
/** A vehicle's logistics pipeline while an order holds it (see master.VEHICLE_STATUSES). */
export const VEHICLE_PIPELINE = ['booked', 'in_transit', 'received', 'ready_for_delivery'] as const;
/** Fixed checklist of documents handed over at delivery (kept small and controlled for compliance). */
export const DELIVERY_DOCUMENTS = ['invoice', 'registration_book', 'warranty_card', 'owners_manual', 'insurance_cover_note'] as const;

// ---------------------------------------------------------------------------
// Leads: a prospect owned by the Salesperson / CRO who logged it. Only name and phone are required
// at first contact; "Convert to Lead" captures the qualifying details (model, colour, payment
// instrument, email) and hands it to the dealership's Admin, who raises the sales order.
// ---------------------------------------------------------------------------
export const lead = salesSchema.table(
  'lead',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    ownerId: bigintId()
      .notNull()
      .references(() => user.id),
    customerId: bigintId().references(() => customer.id),
    prospectName: text().notNull(),
    prospectMobile: text().notNull(),
    prospectMobileNormalized: text().notNull(),
    email: text(),
    source: text({ enum: LEAD_SOURCES }).notNull().default('walk_in'),
    interestedModelId: bigintId().references(() => vehicleModel.id),
    variant: text(),
    preferredColor: text(),
    expectedCloseDate: date({ mode: 'string' }),
    notes: text(),
    // Qualifying payment details, captured at conversion.
    paymentInstrument: text({ enum: PAYMENT_INSTRUMENTS }),
    paymentInstrumentRef: text(),
    paymentInstrumentBank: text(),
    paymentAmount: money(),
    // Follow-ups (see lead_follow_up).
    followUpCount: integer().notNull().default(0),
    lastFollowUpAt: timestamp({ withTimezone: true }),
    // Duplicate-phone escalation: another salesperson hit this lead; the Assistant Manager may convert it.
    escalatedAt: timestamp({ withTimezone: true }),
    escalatedById: bigintId().references(() => user.id),
    escalationNote: text(),
    convertedAt: timestamp({ withTimezone: true }),
    convertedById: bigintId().references(() => user.id),
    status: text({ enum: LEAD_STATES }).notNull().default('new'),
    salesOrderId: bigintId(),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    // Duplicate control: one active lead per phone number per dealership.
    uniqueIndex('lead_active_mobile_uq')
      .on(t.dealershipId, t.prospectMobileNormalized)
      .where(sql`${t.status} in ('new', 'follow_up', 'visited', 'converted', 'processing')`),
    check('lead_follow_up_count', sql`${t.followUpCount} >= 0`),
    index().on(t.dealershipId, t.status),
    // Leads list by latest activity (default "today" view).
    index().on(t.dealershipId, t.updatedAt),
    index().on(t.branchId),
    index().on(t.ownerId),
    index().on(t.customerId),
    index().on(t.interestedModelId),
    index().on(t.dealershipId, t.prospectMobileNormalized),
    index().on(t.escalatedById),
    index().on(t.convertedById),
    index().on(t.salesOrderId),
    index('lead_name_trgm').using('gin', sql`${t.prospectName} gin_trgm_ops`),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

/** One row per follow-up (call, message or visit); the lead keeps a running count. */
export const leadFollowUp = salesSchema.table(
  'lead_follow_up',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    leadId: bigintId()
      .notNull()
      .references(() => lead.id, { onDelete: 'cascade' }),
    outcome: text({ enum: FOLLOW_UP_OUTCOMES }).notNull(),
    remarks: text(),
    createdById: bigintId()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.dealershipId), index().on(t.leadId), index().on(t.createdById), tenantPolicy()],
);

// ---------------------------------------------------------------------------
// Sales orders (PBO: provisional booking order). Amounts are computed server-side.
// ---------------------------------------------------------------------------
export const salesOrder = salesSchema.table(
  'sales_order',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    /** Independent of the dealership, per financial-entity rules (both nullable). */
    legalEntityId: bigintId().references(() => legalEntity.id),
    accountingEntityId: bigintId().references(() => accountingEntity.id),
    orderNo: text().notNull().unique(),
    /** PBO (provisional booking) or CBO (confirmed booking). */
    orderType: text({ enum: ORDER_TYPES }).notNull().default('pbo'),
    leadId: bigintId().references(() => lead.id),
    customerId: bigintId()
      .notNull()
      .references(() => customer.id),
    salespersonId: bigintId()
      .notNull()
      .references(() => user.id),
    modelId: bigintId()
      .notNull()
      .references(() => vehicleModel.id),
    variant: text(),
    color: text(),
    unitPrice: money().notNull().default('0'),
    discount: money().notNull().default('0'),
    totalAmount: money().notNull().default('0'),
    bookingAmount: money().notNull().default('0'),
    expectedDeliveryDate: date({ mode: 'string' }),
    /** Stock vehicle allocated to this order (after approval). */
    vehicleId: bigintId().references(() => vehicle.id),
    /** Bank / leasing company reference, for orders financed rather than paid outright. */
    financingRef: text(),
    /** Pay order / cheque / transfer reference received from the customer. */
    paymentReference: text(),
    notes: text(),
    status: text({ enum: ORDER_STATES }).notNull().default('draft'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    // A vehicle can be on at most one live (not cancelled) order.
    uniqueIndex('sales_order_vehicle_live_uq').on(t.vehicleId).where(sql`${t.vehicleId} is not null and ${t.status} <> 'cancelled'`),
    check('sales_order_amounts', sql`${t.unitPrice} >= 0 and ${t.discount} >= 0 and ${t.discount} <= ${t.unitPrice} and ${t.bookingAmount} >= 0`),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.legalEntityId),
    index().on(t.accountingEntityId),
    index().on(t.leadId),
    index().on(t.customerId),
    index().on(t.salespersonId),
    index().on(t.modelId),
    index().on(t.vehicleId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

// ---------------------------------------------------------------------------
// Deliveries: handing the allocated vehicle to the customer. Completing one activates the vehicle.
// ---------------------------------------------------------------------------
export const delivery = salesSchema.table(
  'delivery',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    deliveryNo: text().notNull().unique(),
    salesOrderId: bigintId()
      .notNull()
      .references(() => salesOrder.id),
    vehicleId: bigintId()
      .notNull()
      .references(() => vehicle.id),
    customerId: bigintId()
      .notNull()
      .references(() => customer.id),
    /** Copied from the order so salespeople see their own deliveries (view_own). */
    salespersonId: bigintId()
      .notNull()
      .references(() => user.id),
    scheduledDate: date({ mode: 'string' }).notNull(),
    deliveredOn: date({ mode: 'string' }),
    deliveredAt: timestamp({ withTimezone: true }),
    deliveredById: bigintId().references(() => user.id),
    odometerKm: integer(),
    /** Required documents handed over at delivery, from DELIVERY_DOCUMENTS (checked off, not free text). */
    documentsHandedOver: text().array().notNull().default(sql`'{}'::text[]`),
    /** Accessories handed over with the vehicle (free text, e.g. "Floor mats", "Mud flaps"). */
    accessoriesHandedOver: text().array().notNull().default(sql`'{}'::text[]`),
    /** The customer confirmed receipt of the vehicle and the listed documents/accessories. */
    customerAcknowledged: boolean().notNull().default(false),
    customerAcknowledgedAt: timestamp({ withTimezone: true }),
    notes: text(),
    status: text({ enum: DELIVERY_STATES }).notNull().default('scheduled'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    // One live delivery per order (a cancelled one can be rescheduled).
    uniqueIndex('delivery_order_live_uq').on(t.salesOrderId).where(sql`${t.status} <> 'cancelled'`),
    check('delivery_odometer', sql`${t.odometerKm} is null or ${t.odometerKm} between 0 and 100000`),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.vehicleId),
    index().on(t.customerId),
    index().on(t.salespersonId),
    index().on(t.deliveredById),
    index().on(t.scheduledDate),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

// ---------------------------------------------------------------------------
// Customer documents issued from a lead. Both are saved (numbered, editable, every change audited)
// and rendered as PDFs in the browser for preview, download and print.
// ---------------------------------------------------------------------------
/** Vehicle quotation: the price quoted to the customer for the lead's vehicle. */
export const quotation = salesSchema.table(
  'quotation',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    quotationNo: text().notNull().unique(),
    leadId: bigintId()
      .notNull()
      .references(() => lead.id),
    /** The lead's salesperson when issued (drives "own" visibility). */
    ownerId: bigintId()
      .notNull()
      .references(() => user.id),
    modelId: bigintId()
      .notNull()
      .references(() => vehicleModel.id),
    /** The dealership's variant code (Hyundai), when the vehicle was picked from the code list. */
    variantCode: text(),
    /** "To:" on the quotation when it is not the customer (e.g. a bank A/C the customer). */
    billTo: text(),
    variant: text(),
    color: text(),
    quantity: integer().notNull().default(1),
    unitPrice: money().notNull(),
    discount: money().notNull().default('0'),
    /** Per vehicle, like the price. */
    freightInsurance: money().notNull().default('0'),
    /** Withholding tax for a filer (per vehicle, a line item); the non-filer amount is quoted in the terms. */
    withholdingTax: money().notNull().default('0'),
    withholdingTaxNonFiler: money(),
    /** quantity x (price - discount + freight + withholding tax). */
    totalAmount: money().notNull(),
    bookingAmount: money(),
    validUntil: date({ mode: 'string' }).notNull(),
    /** Tentative delivery period in days. */
    deliveryDays: integer(),
    paymentMode: text(),
    notes: text(),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    check('quotation_amounts', sql`${t.unitPrice} >= 0 and ${t.discount} >= 0 and ${t.discount} <= ${t.unitPrice} and ${t.freightInsurance} >= 0 and ${t.withholdingTax} >= 0`),
    check('quotation_quantity', sql`${t.quantity} between 1 and 50`),
    index().on(t.dealershipId, t.createdAt),
    index().on(t.branchId),
    index().on(t.leadId),
    index().on(t.ownerId),
    index().on(t.modelId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

/** Paint Protection Film: coverage the customer agreed to, with its price. */
export const PPF_COVERAGES = ['full_body', 'front_package', 'partial', 'custom'] as const;
export const PPF_FINISHES = ['gloss', 'matte'] as const;
/** The PPF voucher's printed fields (in order). Labels can be renamed in the dealership's PPF format. */
export const PPF_VOUCHER_FIELDS = ['pbo', 'customerName', 'email', 'phone', 'chassis', 'engine', 'vehicle', 'salesExecutive', 'promiseDate', 'ppf', 'price', 'paid', 'unpaid', 'notes'] as const;
/** Fields the format may leave off the voucher (PBO, customer, chassis, engine and the amounts always print). */
export const PPF_HIDEABLE_FIELDS = ['email', 'phone', 'vehicle', 'salesExecutive', 'promiseDate', 'ppf', 'notes'] as const;
export const ppfForm = salesSchema.table(
  'ppf_form',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    formNo: text().notNull().unique(),
    leadId: bigintId()
      .notNull()
      .references(() => lead.id),
    ownerId: bigintId()
      .notNull()
      .references(() => user.id),
    /** PBO / chassis / engine as written on the voucher; default to the sales order's once raised. */
    pboNo: text(),
    chassisNo: text(),
    engineNo: text(),
    coverage: text({ enum: PPF_COVERAGES }).notNull(),
    /** Which panels, for partial / custom coverage. */
    coverageDetails: text(),
    filmBrand: text(),
    finish: text({ enum: PPF_FINISHES }).notNull().default('gloss'),
    warrantyYears: integer(),
    amount: money().notNull(),
    discount: money().notNull().default('0'),
    totalAmount: money().notNull(),
    advancePaid: money().notNull().default('0'),
    installationDate: date({ mode: 'string' }),
    notes: text(),
    /** Values of the dealership's own voucher fields (PPF format), by field name. */
    extraFields: jsonb().$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    check('ppf_amounts', sql`${t.amount} >= 0 and ${t.discount} >= 0 and ${t.discount} <= ${t.amount} and ${t.advancePaid} >= 0 and ${t.advancePaid} <= ${t.totalAmount}`),
    check('ppf_warranty', sql`${t.warrantyYears} is null or ${t.warrantyYears} between 0 and 15`),
    index().on(t.dealershipId, t.createdAt),
    index().on(t.branchId),
    index().on(t.leadId),
    index().on(t.ownerId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

// ---- Document formats (letterhead, terms) per dealership ---------------------------------------
/** Documents whose printed format a dealership can edit. PPF gets its own format later. */
export const DOCUMENT_KINDS = ['quotation', 'ppf'] as const;
/**
 * The printed format of a dealership's documents: letterhead, delivery lines, terms and conditions,
 * closing lines and sign-off. Edited by the Assistant Manager / Sales Manager; every document of the
 * dealership prints with the current version. Absent row = the built-in default (templates.ts).
 */
export const documentTemplate = salesSchema.table(
  'document_template',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    kind: text({ enum: DOCUMENT_KINDS }).notNull(),
    companyName: text().notNull(),
    /** Ref on the quotation: <prefix>/<variant code>/<dd-mm-yy> (Hyundai: "HI"); empty = the quotation number. */
    refPrefix: text(),
    tagline: text(),
    address: text(),
    phone: text(),
    email: text(),
    deliveryNotes: text().array().notNull().default(sql`'{}'::text[]`),
    deliveryStation: text(),
    defaultPaymentMode: text(),
    defaultValidityDays: integer().notNull().default(7),
    defaultDeliveryDays: integer(),
    highlightLine: text(),
    standardEquipment: text(),
    terms: text().array().notNull().default(sql`'{}'::text[]`),
    closingLines: text().array().notNull().default(sql`'{}'::text[]`),
    signOff: text().array().notNull().default(sql`'{}'::text[]`),
    /** PPF voucher: its title, renamed field labels, fields left off, and the dealership's own extra fields. */
    title: text(),
    fieldLabels: jsonb().$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    hiddenFields: text().array().notNull().default(sql`'{}'::text[]`),
    customFields: text().array().notNull().default(sql`'{}'::text[]`),
    ...trackedColumns(),
  },
  (t) => [uniqueIndex().on(t.dealershipId, t.kind), ...trackedIndexes(t), tenantPolicy()],
);

// ---- Variant codes (Hyundai: the manufacturer's model codes, e.g. NX4FL16THAW) ---------------
/**
 * A dealership's variant codes and the description printed on its quotations. Only Hyundai uses
 * them; maintained by the Assistant Manager / Sales Manager (paste from Excel).
 */
export const vehicleVariant = salesSchema.table(
  'vehicle_variant',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    /** The catalogue model it belongs to (detected from the description when not given). */
    modelId: bigintId().references(() => vehicleModel.id),
    code: text().notNull(),
    description: text().notNull(),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [uniqueIndex().on(t.dealershipId, t.code), index().on(t.modelId), ...trackedIndexes(t), tenantPolicy()],
);
