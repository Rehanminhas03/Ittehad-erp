import { Id, Timestamp, z } from '../../lib/zod';

const code = z.string().trim().min(2).max(20).regex(/^[A-Z0-9_-]+$/, 'Uppercase letters, digits, - and _ only');
const name = z.string().trim().min(2).max(120);
const optionalText = (max = 200) => z.string().trim().max(max).nullish();

// ---- Dealership --------------------------------------------------------------
export const DealershipSchema = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  brand: z.string(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  legalEntityId: Id.nullable(),
  accountingEntityId: Id.nullable(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const DealershipCreate = z
  .object({
    code,
    name,
    brand: z.string().trim().min(2).max(60),
    city: optionalText(80),
    address: optionalText(),
    phone: optionalText(30),
    legalEntityId: Id.nullish(),
    accountingEntityId: Id.nullish(),
    isActive: z.boolean().optional(),
  })
  .openapi('DealershipCreate');
export const DealershipUpdate = DealershipCreate.omit({ code: true }).partial().openapi('DealershipUpdate');

// ---- Branch ------------------------------------------------------------------
export const BranchSchema = z.object({
  id: Id,
  dealershipId: Id,
  dealershipName: z.string().optional(),
  code: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const BranchCreate = z
  .object({
    dealershipId: Id,
    code,
    name,
    city: optionalText(80),
    address: optionalText(),
    phone: optionalText(30),
    isActive: z.boolean().optional(),
  })
  .openapi('BranchCreate');
// Branches never move between dealerships (their id+dealership pair is referenced by composite FKs).
export const BranchUpdate = BranchCreate.omit({ dealershipId: true, code: true }).partial().openapi('BranchUpdate');

// ---- Legal / accounting entity ----------------------------------------------
export const LegalEntitySchema = z.object({
  id: Id,
  name: z.string(),
  registrationNo: z.string().nullable(),
  taxNo: z.string().nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const LegalEntityCreate = z
  .object({ name, registrationNo: optionalText(60), taxNo: optionalText(60) })
  .openapi('LegalEntityCreate');
export const LegalEntityUpdate = LegalEntityCreate.partial().openapi('LegalEntityUpdate');

export const AccountingEntitySchema = z.object({
  id: Id,
  name: z.string(),
  legalEntityId: Id.nullable(),
  baseCurrency: z.string(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const AccountingEntityCreate = z
  .object({ name, legalEntityId: Id.nullish(), baseCurrency: z.string().length(3).toUpperCase().default('PKR') })
  .openapi('AccountingEntityCreate');
export const AccountingEntityUpdate = AccountingEntityCreate.partial().openapi('AccountingEntityUpdate');

// ---- Roles & permissions ------------------------------------------------------
export const RoleSchema = z.object({
  id: Id,
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const AssignableRoleSchema = z.object({ id: Id, name: z.string(), description: z.string().nullable() }).openapi('AssignableRole');
export const RoleCreate = z.object({ name, description: optionalText(500) }).openapi('RoleCreate');
export const RoleUpdate = RoleCreate.partial().openapi('RoleUpdate');

export const PermissionSchema = z
  .object({ id: Id, code: z.string(), module: z.string(), description: z.string() })
  .openapi('Permission');
export const RolePermissionsBody = z
  .object({ permissionCodes: z.array(z.string()).max(1000) })
  .openapi('RolePermissionsUpdate');
export const RolePermissionsSchema = z
  .object({ roleId: Id, permissionCodes: z.array(z.string()) })
  .openapi('RolePermissions');

// ---- Users --------------------------------------------------------------------
const password = z
  .string()
  .min(10, 'At least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Must contain a letter')
  .regex(/\d/, 'Must contain a digit');

export const UserRoleAssignmentSchema = z
  .object({
    id: Id,
    roleId: Id,
    roleName: z.string(),
    dealershipId: Id.nullable(),
    dealershipName: z.string().nullable(),
    branchId: Id.nullable(),
    branchName: z.string().nullable(),
  })
  .openapi('UserRoleAssignment');

export const UserSchema = z
  .object({
    id: Id,
    email: z.string(),
    fullName: z.string(),
    phone: z.string().nullable(),
    isActive: z.boolean(),
    lastLoginAt: Timestamp.nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
    roles: z.array(UserRoleAssignmentSchema),
  })
  .openapi('User');

export const RoleAssignmentInput = z
  .object({ roleId: Id, dealershipId: Id.nullish(), branchId: Id.nullish() })
  .refine((v) => v.branchId == null || v.dealershipId != null, {
    message: 'dealershipId is required when branchId is set',
    path: ['dealershipId'],
  })
  .openapi('RoleAssignmentInput');

export const UserCreate = z
  .object({
    email: z.email().trim().toLowerCase().max(200),
    fullName: name,
    phone: optionalText(30),
    password,
    roles: z.array(RoleAssignmentInput).max(20).default([]),
  })
  .openapi('UserCreate');

export const UserUpdate = z
  .object({
    /** Sign-in email; must stay unique. */
    email: z.email().trim().toLowerCase().max(200).optional(),
    fullName: name.optional(),
    phone: optionalText(30),
    isActive: z.boolean().optional(),
    password: password.optional(),
  })
  .openapi('UserUpdate');

export const UserListQuery = z.object({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  dealershipId: z.coerce.number().int().positive().optional(),
  roleId: z.coerce.number().int().positive().optional(),
});

// ---- Auth ---------------------------------------------------------------------
export const LoginBody = z
  .object({ email: z.email().trim().toLowerCase(), password: z.string().min(1).max(128) })
  .openapi('LoginRequest');

export const MeSchema = z
  .object({
    user: z.object({ id: Id, email: z.string(), fullName: z.string(), phone: z.string().nullable() }),
    permissions: z.array(
      z.object({
        code: z.string(),
        global: z.boolean(),
        dealershipIds: z.array(Id),
        branchIds: z.array(Id),
      }),
    ),
    dealerships: z.array(z.object({ id: Id, code: z.string(), name: z.string(), brand: z.string() })),
    branches: z.array(z.object({ id: Id, dealershipId: Id, code: z.string(), name: z.string() })),
  })
  .openapi('Me');

export const ChangePasswordBody = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: password })
  .openapi('ChangePasswordRequest');

export const ProfileUpdate = z
  .object({ fullName: name.optional(), phone: optionalText(30) })
  .openapi('ProfileUpdate');

export const TokenResponse = z
  .object({ accessToken: z.string(), expiresIn: z.number().int(), me: MeSchema })
  .openapi('TokenResponse');

// ---- Audit ----------------------------------------------------------------------
// ---- Activity log (everyone: their own; managers: their team's) ----------------------------
export const ACTIVITY_CATEGORIES = ['sign_in', 'leads', 'documents', 'orders', 'deliveries', 'stock', 'users'] as const;
const isoDate = z.iso.date();
export const ActivityQuery = z.object({
  category: z.enum(ACTIVITY_CATEGORIES).optional(),
  /** Pakistan calendar days (inclusive). */
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const TeamActivityQuery = ActivityQuery.extend({
  actorId: z.coerce.number().int().positive().optional(),
  /** Search by the person's name or email. */
  q: z.string().trim().max(100).optional(),
});
export const ActivityEntrySchema = z
  .object({
    id: Id,
    occurredAt: Timestamp,
    actorId: Id.nullable(),
    actorName: z.string().nullable(),
    dealershipId: Id.nullable(),
    dealershipName: z.string().nullable(),
    entityType: z.string(),
    entityId: z.string(),
    /** Readable name of the record (lead's customer, order number, …) when known. */
    entityLabel: z.string().nullable(),
    action: z.string(),
    changes: z.unknown().nullable(),
    ip: z.string().nullable(),
  })
  .openapi('ActivityEntry');
export const ActivityPageSchema = z
  .object({ items: z.array(ActivityEntrySchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() })
  .openapi('ActivityPage');

export const AuditQuery = z.object({
  entityType: z.string().max(80).optional(),
  entityId: z.string().max(40).optional(),
  actorId: z.coerce.number().int().positive().optional(),
  dealershipId: z.coerce.number().int().positive().optional(),
  action: z.string().max(80).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
