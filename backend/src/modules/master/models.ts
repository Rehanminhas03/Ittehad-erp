import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigintId, createdAt, pk } from '../../db/columns';
import { coreSchema, dealership, tenantPolicy, trackedColumns, trackedIndexes, user } from '../core/models';

// Master data lives in the `core` schema: every other module (sales, service, parts, accounts)
// references customers and vehicles. `*_trgm` GIN indexes serve partial (ILIKE '%…%') search;
// pg_trgm is enabled in pre-push.sql.

// ---------------------------------------------------------------------------
// Vehicle model catalogue (global): brand + model. Service schedules (phase 4) key off this.
// ---------------------------------------------------------------------------
export const vehicleModel = coreSchema.table(
  'vehicle_model',
  {
    id: pk(),
    brand: text().notNull(),
    name: text().notNull(),
    bodyType: text(),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [unique().on(t.brand, t.name), ...trackedIndexes(t)],
);

// ---------------------------------------------------------------------------
// Customers: owned by one dealership (personal data stays inside it).
// Duplicates are impossible per dealership on normalised mobile and on CNIC.
// ---------------------------------------------------------------------------
export const customer = coreSchema.table(
  'customer',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    kind: text({ enum: ['individual', 'company'] }).notNull().default('individual'),
    fullName: text().notNull(),
    /** As entered (for display). */
    mobile: text().notNull(),
    /** E.164, e.g. +923001234567: the identity used for duplicate checks and search. */
    mobileNormalized: text().notNull(),
    altPhone: text(),
    email: text(),
    /** 13-digit CNIC, digits only. */
    cnic: text(),
    ntn: text(),
    address: text(),
    city: text(),
    notes: text(),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [
    uniqueIndex('customer_dealership_mobile_uq').on(t.dealershipId, t.mobileNormalized),
    uniqueIndex('customer_dealership_cnic_uq').on(t.dealershipId, t.cnic).where(sql`${t.cnic} is not null`),
    check('customer_cnic_digits', sql`${t.cnic} is null or ${t.cnic} ~ '^[0-9]{13}$'`),
    index().on(t.dealershipId),
    index('customer_name_trgm').using('gin', sql`${t.fullName} gin_trgm_ops`),
    index('customer_mobile_trgm').using('gin', sql`${t.mobileNormalized} gin_trgm_ops`),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

// ---------------------------------------------------------------------------
// Vehicles: one row per physical vehicle across the whole group (no duplicates anywhere).
// Dealerships see a vehicle once it is linked to them (vehicle_dealership).
// ---------------------------------------------------------------------------
/**
 * Pre-sale logistics through to after-sale stock control. `available` is the resting state; a
 * sales order allocation moves a vehicle to `booked`, physical logistics move it on to
 * `in_transit` / `received` / `ready_for_delivery`, and completing the delivery sets `delivered`.
 * `reserved` (held against interest before an order exists), `transferred` (moved to another
 * dealership's stock) and `hold` (pulled off sale) are manually set, outside that automatic chain.
 */
export const VEHICLE_STATUSES = [
  'available',
  'reserved',
  'booked',
  'in_transit',
  'received',
  'ready_for_delivery',
  'delivered',
  'transferred',
  'hold',
] as const;

export const vehicle = coreSchema.table(
  'vehicle',
  {
    id: pk(),
    /** Chassis / VIN, uppercase alphanumerics only. Nullable: an order may be saved before the chassis is known. */
    vin: text(),
    engineNo: text(),
    /** Registration plate, uppercase alphanumerics only (e.g. LEA1234). */
    registrationNo: text(),
    modelId: bigintId()
      .notNull()
      .references(() => vehicleModel.id),
    variant: text(),
    modelYear: integer(),
    color: text(),
    notes: text(),
    /** Stock / delivery pipeline state (see VEHICLE_STATUSES); driven mainly from Sales. */
    status: text({ enum: VEHICLE_STATUSES }).notNull().default('available'),
    /** Set once, when the vehicle is delivered to its first owner (start of warranty and service schedule). */
    activatedOn: date({ mode: 'string' }),
    warrantyEndsOn: date({ mode: 'string' }),
    activationOdometerKm: integer(),
    soldByDealershipId: bigintId().references(() => dealership.id),
    /** Group-wide service counters (kept here because visits are dealership-private). */
    serviceVisitCount: integer().notNull().default(0),
    lastServiceOn: date({ mode: 'string' }),
    lastOdometerKm: integer(),
    ...trackedColumns(),
  },
  (t) => [
    uniqueIndex('vehicle_vin_uq').on(t.vin).where(sql`${t.vin} is not null`),
    index().on(t.soldByDealershipId),
    index().on(t.status),
    uniqueIndex('vehicle_engine_uq').on(t.engineNo).where(sql`${t.engineNo} is not null`),
    uniqueIndex('vehicle_registration_uq').on(t.registrationNo).where(sql`${t.registrationNo} is not null`),
    check('vehicle_model_year', sql`${t.modelYear} is null or ${t.modelYear} between 1950 and 2100`),
    index().on(t.modelId),
    index('vehicle_vin_trgm').using('gin', sql`${t.vin} gin_trgm_ops`),
    index('vehicle_registration_trgm').using('gin', sql`${t.registrationNo} gin_trgm_ops`),
    index('vehicle_engine_trgm').using('gin', sql`${t.engineNo} gin_trgm_ops`),
    ...trackedIndexes(t),
  ],
);

/** Which dealerships a vehicle belongs to (sold there, serviced there, or added manually). */
export const vehicleDealership = coreSchema.table(
  'vehicle_dealership',
  {
    id: pk(),
    vehicleId: bigintId()
      .notNull()
      .references(() => vehicle.id),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    source: text({ enum: ['manual', 'sale', 'service'] }).notNull().default('manual'),
    createdAt: createdAt(),
    createdById: bigintId().references(() => user.id),
  },
  (t) => [
    unique().on(t.vehicleId, t.dealershipId),
    index().on(t.dealershipId),
    index().on(t.createdById),
    tenantPolicy(),
  ],
);

/**
 * Ownership history as known to a dealership. At most one open (current) ownership per
 * vehicle per dealership; a transfer closes the previous one.
 */
export const vehicleOwnership = coreSchema.table(
  'vehicle_ownership',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    vehicleId: bigintId()
      .notNull()
      .references(() => vehicle.id),
    customerId: bigintId()
      .notNull()
      .references(() => customer.id),
    startDate: date({ mode: 'string' }).notNull(),
    endDate: date({ mode: 'string' }),
    createdAt: createdAt(),
    createdById: bigintId().references(() => user.id),
    endedAt: timestamp({ withTimezone: true }),
    endedById: bigintId().references(() => user.id),
  },
  (t) => [
    uniqueIndex('vehicle_ownership_current_uq')
      .on(t.vehicleId, t.dealershipId)
      .where(sql`${t.endDate} is null`),
    check('vehicle_ownership_dates', sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    index().on(t.dealershipId),
    index().on(t.vehicleId),
    index().on(t.customerId),
    index().on(t.createdById),
    index().on(t.endedById),
    tenantPolicy(),
  ],
);
