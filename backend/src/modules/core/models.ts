import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { bigintId, createdAt, pk, updatedAt } from '../../db/columns';

export const coreSchema = pgSchema('core');
export const auditSchema = pgSchema('audit');

// ---------------------------------------------------------------------------
// Legal / accounting entities: independent of dealership so one company can own
// several dealerships, or one dealership can book to a different ledger.
// ---------------------------------------------------------------------------
export const legalEntity = coreSchema.table('legal_entity', {
  id: pk(),
  name: text().notNull(),
  registrationNo: text(),
  taxNo: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accountingEntity = coreSchema.table(
  'accounting_entity',
  {
    id: pk(),
    name: text().notNull(),
    legalEntityId: bigintId().references(() => legalEntity.id),
    baseCurrency: text().notNull().default('PKR'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.legalEntityId)],
);

// ---------------------------------------------------------------------------
// Users (global identities; tenant access comes from user_role scope)
// ---------------------------------------------------------------------------
export const user = coreSchema.table(
  'user',
  {
    id: pk(),
    email: text().notNull(),
    fullName: text().notNull(),
    phone: text(),
    passwordHash: text().notNull(),
    isActive: boolean().notNull().default(true),
    /** Bumped to invalidate every outstanding access token for the user. */
    tokenVersion: integer().notNull().default(0),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('user_email_lower_uq').on(sql`lower(${t.email})`)],
);

/**
 * Row-Level Security policy for a tenant table (second isolation layer beneath the API).
 * core.app_tenant_visible() is defined in src/db/sql/pre-push.sql and reads the
 * transaction-local settings applied per request by withTenantTx().
 * Tables with a policy get RLS enabled by drizzle-kit push.
 */
export const tenantPolicy = (dealershipColumn = 'dealership_id') =>
  pgPolicy('tenant_isolation', {
    for: 'all',
    using: sql.raw(`core.app_tenant_visible(${dealershipColumn})`),
    withCheck: sql.raw(`core.app_tenant_visible(${dealershipColumn})`),
  });

/** Standard created/updated-by columns for business tables. */
export const trackedColumns = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  createdById: bigintId().references(() => user.id),
  updatedById: bigintId().references(() => user.id),
});

/** Every FK is indexed; spread into a table's extra-config array alongside trackedColumns. */
export const trackedIndexes = (t: {
  createdById: AnyPgColumn;
  updatedById: AnyPgColumn;
}) => [index().on(t.createdById), index().on(t.updatedById)];

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------
export const dealership = coreSchema.table(
  'dealership',
  {
    id: pk(),
    code: text().notNull().unique(),
    name: text().notNull(),
    brand: text().notNull(),
    city: text(),
    address: text(),
    phone: text(),
    legalEntityId: bigintId().references(() => legalEntity.id),
    accountingEntityId: bigintId().references(() => accountingEntity.id),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [index().on(t.legalEntityId), index().on(t.accountingEntityId), ...trackedIndexes(t), tenantPolicy('id')],
);

export const branch = coreSchema.table(
  'branch',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    code: text().notNull(),
    name: text().notNull(),
    city: text(),
    address: text(),
    phone: text(),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [
    unique().on(t.dealershipId, t.code),
    // Target for composite FKs that guarantee a row's branch belongs to its dealership.
    unique('branch_id_dealership_uq').on(t.id, t.dealershipId),
    index().on(t.dealershipId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

/**
 * Composite FK guaranteeing a row's (optional) branch belongs to the row's dealership.
 * Use in any table with `dealershipId` + `branchId`.
 */
export const branchFk = (t: { branchId: AnyPgColumn; dealershipId: AnyPgColumn }) =>
  foreignKey({ columns: [t.branchId, t.dealershipId], foreignColumns: [branch.id, branch.dealershipId] });

// ---------------------------------------------------------------------------
// RBAC: users -> roles -> permissions; role assignment carries the tenant scope.
// ---------------------------------------------------------------------------
export const role = coreSchema.table(
  'role',
  {
    id: pk(),
    name: text().notNull().unique(),
    description: text(),
    /** System roles cannot be deleted (their permissions remain editable). */
    isSystem: boolean().notNull().default(false),
    /**
     * Permission whose holders may assign this role, and manage (edit, reset, deactivate) its holders,
     * within their scope without holding every permission of the role, e.g. a Sales Manager managing
     * Salespersons. Null: only someone holding all of the role's permissions may.
     */
    delegatedBy: text(),
    ...trackedColumns(),
  },
  (t) => [...trackedIndexes(t)],
);

export const permission = coreSchema.table(
  'permission',
  {
    id: pk(),
    code: text().notNull().unique(),
    module: text().notNull(),
    description: text().notNull(),
  },
  (t) => [index().on(t.module)],
);

export const rolePermission = coreSchema.table(
  'role_permission',
  {
    roleId: bigintId()
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: bigintId()
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] }), index().on(t.permissionId)],
);

/**
 * dealership_id NULL  => role applies to every dealership (global).
 * branch_id NULL      => role applies to the whole dealership.
 */
export const userRole = coreSchema.table(
  'user_role',
  {
    id: pk(),
    userId: bigintId()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: bigintId()
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    dealershipId: bigintId().references(() => dealership.id),
    branchId: bigintId(),
    createdAt: createdAt(),
    createdById: bigintId().references(() => user.id),
  },
  (t) => [
    // One assignment per user+role+scope; NULL scope columns (global / whole dealership) compare equal.
    // (An expression index rather than UNIQUE NULLS NOT DISTINCT, which drizzle-kit push cannot diff.)
    uniqueIndex('user_role_scope_uq').on(
      t.userId,
      t.roleId,
      sql`coalesce(${t.dealershipId}, 0)`,
      sql`coalesce(${t.branchId}, 0)`,
    ),
    foreignKey({ columns: [t.branchId, t.dealershipId], foreignColumns: [branch.id, branch.dealershipId] }),
    check('user_role_branch_needs_dealership', sql`${t.branchId} is null or ${t.dealershipId} is not null`),
    index().on(t.userId),
    index().on(t.roleId),
    index().on(t.dealershipId),
    index().on(t.branchId),
    index().on(t.createdById),
  ],
);

export const refreshToken = coreSchema.table(
  'refresh_token',
  {
    id: pk(),
    userId: bigintId()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    userAgent: text(),
    ip: text(),
  },
  (t) => [index().on(t.userId)],
);

// ---------------------------------------------------------------------------
// Generic approval / workflow history (append-only), shared by every workflow.
// ---------------------------------------------------------------------------
export const workflowTransition = coreSchema.table(
  'workflow_transition',
  {
    id: pk(),
    entityType: text().notNull(),
    entityId: bigintId().notNull(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    action: text().notNull(),
    fromState: text().notNull(),
    toState: text().notNull(),
    comment: text(),
    actorId: bigintId()
      .notNull()
      .references(() => user.id),
    occurredAt: createdAt(),
  },
  (t) => [
    index().on(t.entityType, t.entityId),
    index().on(t.dealershipId),
    index().on(t.actorId),
    tenantPolicy(),
  ],
);

// ---------------------------------------------------------------------------
// Document numbering: one gap-free counter per dealership, document type and year
// (e.g. HYD-ISB-SO-2026-00001). Incremented inside the business transaction, so a rollback
// also rolls back the number.
// ---------------------------------------------------------------------------
export const documentSequence = coreSchema.table(
  'document_sequence',
  {
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    docType: text().notNull(),
    year: integer().notNull(),
    lastNo: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.dealershipId, t.docType, t.year] }), tenantPolicy()],
);

// ---------------------------------------------------------------------------
// Domain events (append-only outbox). Published in the same transaction as the change that
// caused them; in-process subscribers (other modules) react within that transaction.
// ---------------------------------------------------------------------------
export const domainEvent = coreSchema.table(
  'domain_event',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    type: text().notNull(),
    aggregateType: text().notNull(),
    aggregateId: bigintId().notNull(),
    payload: jsonb().notNull(),
    actorId: bigintId().references(() => user.id),
    occurredAt: createdAt(),
  },
  (t) => [
    index().on(t.dealershipId, t.occurredAt),
    index().on(t.type, t.occurredAt),
    index().on(t.aggregateType, t.aggregateId),
    index().on(t.actorId),
    tenantPolicy(),
  ],
);

// ---------------------------------------------------------------------------
// Audit log (append-only; enforced by trigger + grants in migration)
// ---------------------------------------------------------------------------
export const auditLog = auditSchema.table(
  'audit_log',
  {
    id: pk(),
    occurredAt: createdAt(),
    actorId: bigintId().references(() => user.id),
    dealershipId: bigintId().references(() => dealership.id),
    /** Informational only (no FK) so audit rows never block branch changes. */
    branchId: bigintId(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    action: text().notNull(),
    changes: jsonb(),
    requestId: text(),
    ip: text(),
  },
  (t) => [
    index().on(t.entityType, t.entityId),
    index().on(t.dealershipId, t.occurredAt),
    index().on(t.branchId),
    index().on(t.actorId),
    index().on(t.occurredAt),
    // Everyone may read their own activity. Otherwise: dealership rows by tenant, and global
    // (dealership-less) rows to global callers only.
    pgPolicy('audit_read', {
      for: 'select',
      using: sql.raw(
        'actor_id = core.app_user_id() or (case when dealership_id is null then core.app_is_global() else core.app_tenant_visible(dealership_id) end)',
      ),
    }),
    pgPolicy('audit_write', { for: 'insert', withCheck: sql`true` }),
  ],
);

// ---------------------------------------------------------------------------
// Notifications: one row per recipient ("New lead added — by Sales 1"), written in the same
// transaction as the change (see notifications.ts) and pushed live over the socket after commit.
// Each person reads, marks and deletes only their own.
// ---------------------------------------------------------------------------
export const notification = coreSchema.table(
  'notification',
  {
    id: pk(),
    userId: bigintId()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dealershipId: bigintId().references(() => dealership.id),
    /** What it is about, e.g. sales.lead / create (the audit entry it comes from). */
    entityType: text().notNull(),
    entityId: text().notNull(),
    action: text().notNull(),
    /** The task, e.g. "New lead added". */
    title: text().notNull(),
    /** Short reference, e.g. a quotation number or chassis number (no customer details). */
    detail: text(),
    /** Where the record opens in the app. */
    href: text(),
    actorId: bigintId().references(() => user.id),
    actorName: text(),
    createdAt: createdAt(),
    readAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index('notification_unread_idx').on(t.userId).where(sql`${t.readAt} is null`),
    index().on(t.dealershipId),
    index().on(t.actorId),
    // Read: your own, plus the ones your change just created for others (so they can be sent out).
    // Mark read / delete: only your own. Create: for anyone (the change's recipients).
    pgPolicy('notification_read', { for: 'select', using: sql`user_id = core.app_user_id() or actor_id = core.app_user_id()` }),
    pgPolicy('notification_insert', { for: 'insert', withCheck: sql`true` }),
    pgPolicy('notification_update', { for: 'update', using: sql`user_id = core.app_user_id()`, withCheck: sql`user_id = core.app_user_id()` }),
    pgPolicy('notification_delete', { for: 'delete', using: sql`user_id = core.app_user_id()` }),
  ],
);
