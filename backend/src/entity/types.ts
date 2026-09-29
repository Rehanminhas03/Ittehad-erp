import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Access } from '../auth/access';
import type { ZodObject, ZodType } from 'zod';
import type { RouteCtx } from '../http/apiRouter';

// Drizzle's table generics are too deep to thread through a generic engine; the engine works on
// column-keyed records and each config supplies precise zod schemas for the API surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTable = PgTable & Record<string, any>;
export type Row = Record<string, unknown> & { id: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityCtx = RouteCtx<any, any, any>;

export interface WorkflowTransitionDef {
  action: string;
  label: string;
  from: readonly string[];
  to: string;
  /** Permission checked against the row's tenant scope. */
  permission: string;
  /** Alternative permission that allows the transition on the caller's own rows (config.ownerKey). */
  ownPermission?: string;
  /** Run only by server code (never offered to users or accepted from the API). */
  system?: boolean;
  requiresComment?: boolean;
  /** Returns an error message to block the transition (e.g. segregation of duties). */
  guard?: (ctx: EntityCtx, row: Row) => Promise<string | null> | string | null;
  /** Side effects inside the same transaction, after the state change. */
  effect?: (ctx: EntityCtx, row: Row) => Promise<void>;
}

export interface WorkflowDef {
  /** Property key of the state column. */
  stateKey: string;
  initial: string;
  states: readonly { key: string; label: string; terminal?: boolean }[];
  transitions: readonly WorkflowTransitionDef[];
}

export interface TenantDef {
  /** Property key holding the dealership id ('id' for the dealership table itself). */
  dealershipKey: string;
  /** Property key holding the branch id, for branch-aware entities. */
  branchKey?: string;
  /** The dealership table itself: creating one requires a global grant. */
  root?: boolean;
}

export interface EntityPermissions {
  view: string;
  viewOwn?: string;
  /**
   * A third, conditional view right: rows matching `condition` are visible to holders of `code`
   * within its tenant scope (e.g. an Admin sees leads only once they are converted).
   */
  viewWhen?: { code: string; condition: SQL };
  create?: string;
  update?: string;
  updateOwn?: string;
  delete?: string;
}

export interface EntityHooks {
  /** May return a replacement data object; throw HttpError to reject. */
  beforeCreate?(ctx: EntityCtx, data: Record<string, unknown>): Promise<Record<string, unknown> | void>;
  afterCreate?(ctx: EntityCtx, row: Row): Promise<void>;
  beforeUpdate?(ctx: EntityCtx, row: Row, patch: Record<string, unknown>): Promise<Record<string, unknown> | void>;
  afterUpdate?(ctx: EntityCtx, row: Row, before: Row): Promise<void>;
  beforeDelete?(ctx: EntityCtx, row: Row): Promise<void>;
  /** Batch-enrich rows for responses (e.g. related names). Must not change row count/order. */
  decorate?(ctx: EntityCtx, rows: Row[]): Promise<Row[]>;
}

export interface EntityConfig {
  /** Stable key used in audit log and workflow history, e.g. 'core.dealership'. */
  entityType: string;
  /** API module; routes mount at /api/<module>/<path> and are tagged with it. */
  module: string;
  path: string;
  /** Used to build operationIds: listDealerships, getDealership, ... */
  names: { singular: string; plural: string };
  table: AnyTable;
  schemas: {
    read: ZodObject;
    create?: ZodObject;
    update?: ZodObject;
  };
  permissions: EntityPermissions;
  /** null => global master data (reads need the view permission, writes need a global grant). */
  tenant: TenantDef | null;
  /**
   * For entities with no tenant column whose tenancy runs through a link table
   * (e.g. a vehicle is shared group-wide but linked to the dealerships that sold/serviced it).
   * Requires `tenant: null`; replaces the default read scope and write authorization.
   */
  linkedScope?: {
    /** Read scope for the permission code(s). */
    view(access: Access, codes: string[]): SQL;
    /** A dealership (linked to the row) where `permission` authorizes the write, or null. Used for audit too. */
    writeDealership(ctx: EntityCtx, row: Row, permission: string): Promise<number | null>;
  };
  /** Property key of the owning user, enabling *_own permissions. */
  ownerKey?: string;
  search?: readonly string[];
  /** Canonicalise the search string before matching (e.g. identifiers stored without dashes). */
  normalizeSearch?: (q: string) => string;
  /** Exact-match query filters: query param -> column key + zod parser. */
  /** Query filters: exact match on `key` by default, or a custom condition via `where`. */
  filters?: Record<string, { key: string; schema: ZodType; where?: (value: unknown) => SQL }>;
  sort: { default: string; keys: readonly string[] };
  workflow?: WorkflowDef;
  hooks?: EntityHooks;
  /** Set when the table has createdById/updatedById columns. Default true. */
  tracked?: boolean;
}

export type { AnyPgColumn };
