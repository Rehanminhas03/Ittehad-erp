import { Id, Timestamp, z } from '../../lib/zod';
import { normalizeCnic, normalizeIdentifier, normalizeMobile } from './normalize';
import { VEHICLE_STATUSES } from './models';

const optionalText = (max = 200) => z.string().trim().max(max).nullish();
const nullIfBlank = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v);

// ---- Vehicle models -------------------------------------------------------------
export const VehicleModelSchema = z.object({
  id: Id,
  brand: z.string(),
  name: z.string(),
  bodyType: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const VehicleModelCreate = z
  .object({
    brand: z.string().trim().min(2).max(60),
    name: z.string().trim().min(1).max(80),
    bodyType: optionalText(40),
    isActive: z.boolean().optional(),
  })
  .openapi('VehicleModelCreate');
export const VehicleModelUpdate = VehicleModelCreate.partial().openapi('VehicleModelUpdate');
/** A model of the dealership's own brand (the brand comes from the dealership). */
export const DealershipModelCreate = z
  .object({ dealershipId: Id, name: z.string().trim().min(1).max(80) })
  .openapi('DealershipModelCreate');
export const DealershipModelUpdate = z
  .object({ dealershipId: Id, name: z.string().trim().min(1).max(80).optional(), isActive: z.boolean().optional() })
  .openapi('DealershipModelUpdate');

// ---- Customers --------------------------------------------------------------------
const mobile = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .max(30)
  .refine((v) => normalizeMobile(v) !== null, 'Enter a valid mobile number, e.g. 0300-1234567');
const cnic = z
  .string()
  .trim()
  .max(20)
  .nullish()
  .transform(nullIfBlank)
  .refine((v) => v === null || normalizeCnic(v) !== null, 'CNIC must be 13 digits, e.g. 35202-1234567-1');

export const CustomerSchema = z.object({
  id: Id,
  dealershipId: Id,
  dealershipName: z.string().optional(),
  kind: z.enum(['individual', 'company']),
  fullName: z.string(),
  mobile: z.string(),
  mobileNormalized: z.string(),
  altPhone: z.string().nullable(),
  email: z.string().nullable(),
  cnic: z.string().nullable(),
  ntn: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

const customerFields = {
  kind: z.enum(['individual', 'company']).default('individual'),
  fullName: z.string().trim().min(2).max(120),
  mobile,
  altPhone: optionalText(30),
  email: z.email().trim().toLowerCase().max(200).nullish().or(z.literal('').transform(() => null)),
  cnic,
  ntn: optionalText(30),
  address: optionalText(300),
  city: optionalText(80),
  notes: optionalText(2000),
};
export const CustomerCreate = z.object({ dealershipId: Id, ...customerFields }).openapi('CustomerCreate');
export const CustomerUpdate = z
  .object({ ...customerFields, kind: customerFields.kind.optional(), isActive: z.boolean().optional() })
  .partial()
  .openapi('CustomerUpdate');

// ---- Vehicles ---------------------------------------------------------------------
const identifier = (label: string, min: number) =>
  z
    .string()
    .trim()
    .max(40)
    .transform(normalizeIdentifier)
    .refine((v) => v.length >= min && v.length <= 25, `${label} must be ${min}-25 letters/digits`);
const optionalIdentifier = (label: string) =>
  z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v == null ? null : normalizeIdentifier(v) || null))
    .refine((v) => v === null || (v.length >= 3 && v.length <= 25), `${label} must be 3-25 letters/digits`);

export const OwnerSummary = z.object({ customerId: Id, fullName: z.string(), mobile: z.string(), dealershipId: Id, since: z.string() });

export const VehicleSchema = z.object({
  id: Id,
  vin: z.string().nullable(),
  engineNo: z.string().nullable(),
  registrationNo: z.string().nullable(),
  modelId: Id,
  modelName: z.string().optional(),
  variant: z.string().nullable(),
  modelYear: z.number().int().nullable(),
  color: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(VEHICLE_STATUSES),
  activatedOn: z.string().nullable(),
  warrantyEndsOn: z.string().nullable(),
  activationOdometerKm: z.number().int().nullable(),
  soldByDealershipId: Id.nullable(),
  serviceVisitCount: z.number().int(),
  lastServiceOn: z.string().nullable(),
  lastOdometerKm: z.number().int().nullable(),
  currentOwner: OwnerSummary.nullable().optional(),
  dealerships: z.array(z.object({ id: Id, name: z.string() })).optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

const vehicleFields = {
  vin: identifier('VIN / chassis number', 5),
  engineNo: optionalIdentifier('Engine number'),
  registrationNo: optionalIdentifier('Registration number'),
  modelId: Id,
  variant: optionalText(80),
  modelYear: z.number().int().min(1950).max(2100).nullish(),
  color: optionalText(40),
  notes: optionalText(2000),
};
export const VehicleCreate = z
  .object({
    dealershipId: Id,
    ...vehicleFields,
    /** Optional: record the current owner in the same step. */
    ownerCustomerId: Id.nullish(),
  })
  .openapi('VehicleCreate');
export const VehicleUpdate = z.object(vehicleFields).partial().openapi('VehicleUpdate');

export const VehicleLinkBody = z
  .object({ dealershipId: Id, identifier: z.string().trim().min(3).max(40) })
  .openapi('VehicleLinkRequest');

// ---- Ownership ----------------------------------------------------------------------
export const OwnershipSchema = z
  .object({
    id: Id,
    dealershipId: Id,
    vehicleId: Id,
    customerId: Id,
    customerName: z.string(),
    customerMobile: z.string(),
    startDate: z.string(),
    endDate: z.string().nullable(),
  })
  .openapi('VehicleOwnership');
export const OwnershipCreate = z
  .object({ customerId: Id, startDate: z.iso.date().optional() })
  .openapi('OwnershipCreate');

export const CustomerVehicleSchema = z
  .object({
    vehicleId: Id,
    vin: z.string().nullable(),
    registrationNo: z.string().nullable(),
    modelName: z.string(),
    startDate: z.string(),
    endDate: z.string().nullable(),
  })
  .openapi('CustomerVehicle');

// ---- Unified search -------------------------------------------------------------------
export const SearchQuery = z.object({ q: z.string().trim().min(2).max(60) });
export const SearchResultSchema = z
  .object({
    vehicles: z.array(
      z.object({
        id: Id,
        vin: z.string().nullable(),
        registrationNo: z.string().nullable(),
        engineNo: z.string().nullable(),
        modelName: z.string(),
        modelYear: z.number().int().nullable(),
        exact: z.boolean(),
        currentOwner: OwnerSummary.nullable(),
      }),
    ),
    customers: z.array(
      z.object({
        id: Id,
        fullName: z.string(),
        mobile: z.string(),
        cnic: z.string().nullable(),
        dealershipId: Id,
        dealershipName: z.string(),
        exact: z.boolean(),
      }),
    ),
    /** Exact identifier matches registered elsewhere in the group: link instead of re-creating. */
    groupMatches: z.array(
      z.object({ vin: z.string().nullable(), registrationNo: z.string().nullable(), modelName: z.string(), matchedOn: z.enum(['vin', 'engineNo', 'registrationNo']) }),
    ),
  })
  .openapi('SearchResult');
