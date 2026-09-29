import type { ReactNode } from 'react';
import type { ZodType } from 'zod';
import type { PermissionApi } from '@/shared/hooks';

// ---------------------------------------------------------------------------
// Structural shapes of RTK Query hooks, so configs can take any generated hook.
// ---------------------------------------------------------------------------
export interface QueryResult<T> {
  data?: T;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => unknown;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryHook<A, T> = (arg: A, options?: { skip?: boolean }) => QueryResult<T>;
export type MutationHook<A, T> = () => readonly [(arg: A) => { unwrap(): Promise<T> }, { isLoading: boolean }];

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditItem {
  id: number;
  occurredAt: string;
  actorId: number | null;
  actorName: string | null;
  action: string;
  changes?: unknown;
}

export interface TransitionItem {
  id: number;
  action: string;
  fromState: string;
  toState: string;
  comment: string | null;
  actorName: string | null;
  occurredAt: string;
}

export interface EntityHistory {
  audit: AuditItem[];
  transitions: TransitionItem[];
}

/** Mirrors the backend WorkflowDefinition (GET /<entity>/workflow). */
export interface WorkflowDefinition {
  stateKey: string;
  initial: string;
  states: { key: string; label: string; terminal?: boolean }[];
  /** `system` transitions are run by the server (e.g. delivery) and are never offered as buttons. */
  transitions: { action: string; label: string; from: string[]; to: string; requiresComment: boolean; system?: boolean }[];
}

// ---------------------------------------------------------------------------
// View config
// ---------------------------------------------------------------------------
export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  /** Backend sort key; omit for non-sortable columns. */
  sortKey?: string;
  className?: string;
  /** Show the column only to some users (e.g. "Salesperson" is pointless to someone who only sees their own). */
  visible?: (perm: PermissionApi) => boolean;
}

export interface FilterDef {
  /** Query parameter sent to the list endpoint. */
  param: string;
  label: string;
  /** 'hidden': no dropdown; set by a link (e.g. a dashboard tile) and shown as a removable chip. */
  type: 'select' | 'boolean' | 'dealership' | 'hidden';
  /** For 'hidden': the chip text for a value (default: the label). */
  chip?: (value: string) => string;
  options?: { value: string; label: string }[];
  /** For 'select': options loaded from the API (a hook; keep it stable per filter). */
  useOptions?: () => { value: string; label: string }[];
  /** Show the filter only to some users (e.g. "Salesperson" only to those who see the team). */
  visible?: (perm: PermissionApi) => boolean;
}

export type FormFieldType =
  | 'text'
  | 'email'
  /** Phone number: digits only (see FormFieldControl). */
  | 'tel'
  | 'password'
  | 'textarea'
  | 'number'
  | 'money'
  | 'date'
  | 'boolean'
  | 'select'
  | 'dealership'
  | 'branch'
  | 'custom';

/** Props passed to a `custom` field's renderer (wired to React Hook Form). */
export interface CustomFieldProps {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
  /** Current values of the whole form (e.g. to scope a picker to the chosen dealership). */
  values: Record<string, unknown>;
}

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  /** For 'select': options loaded from the API (called as a hook, so keep it stable per field). */
  useOptions?: () => { value: string; label: string }[];
  /** Which form(s) show the field. Default 'both'. */
  mode?: 'create' | 'edit' | 'both';
  /** Grid columns (of 2). Default 1. */
  span?: 1 | 2;
  /** For 'branch': the form field holding the dealership id. */
  dealershipField?: string;
  /** For 'dealership' / 'branch': only offer tenants where the user holds this permission. */
  scopePermission?: string;
  /** For 'custom': renders the control (e.g. a searchable picker from a feature). */
  render?: (props: CustomFieldProps) => ReactNode;
  /** Show the field only to some users (e.g. "Salesperson" only to team leaders). */
  visible?: (perm: PermissionApi) => boolean;
}

export interface DisplayField<T> {
  label: string;
  value: (row: T) => ReactNode;
}

export interface EntityViewConfig<T extends { id: number }> {
  singular: string;
  plural: string;
  /** Route prefix, e.g. '/admin/dealerships'. */
  basePath: string;
  /** Matches the backend entityType (audit / workflow history). */
  entityType: string;
  permissions: {
    view: string[];
    create?: string;
    update?: string[];
  };
  /** Tenant columns for row-level UI gating; omit for global master data (writes need a global grant). */
  scope?: { dealershipKey: keyof T & string; branchKey?: keyof T & string };
  /** Owning user's id field: `*_own` permissions only apply to rows where it equals the current user. */
  ownerKey?: keyof T & string;
  /** Overrides the default edit gating for entities whose scope is not a simple tenant column. */
  canEdit?: (row: T, perm: PermissionApi) => boolean;
  list: {
    columns: ColumnDef<T>[];
    filters?: FilterDef[];
    defaultSort: string;
    searchPlaceholder?: string;
    /** Custom create screen (instead of the generated form), shown to holders of `permissions.create`. */
    createPath?: string;
    /** Rendered above the search (e.g. a summary of totals). */
    /** Above the list; gets the list's current query (filters, dates) and its period, e.g. "last 30 days". */
    header?: (ctx: { query: Record<string, unknown>; periodLabel: string }) => ReactNode;
    /**
     * A date filter (quick ranges + custom dates) sent as two query params, e.g. the leads list by
     * latest activity. `defaultPreset` applies when the URL names none (e.g. 'today').
     */
    dateRange?: { label: string; fromParam: string; toParam: string; defaultPreset?: string };
  };
  detail: {
    title: (row: T) => string;
    subtitle?: (row: T) => ReactNode;
    fields: DisplayField<T>[];
    /** Extra sections below the fields (e.g. related records). */
    sections?: (row: T) => ReactNode;
    /**
     * A hook, called with the record id while the record itself loads: starts the sections' requests
     * at the same time (same query args, so the sections read them from the cache) instead of after.
     */
    usePrefetch?: (id: number) => void;
  };
  form?: {
    fields: FormField[];
    createSchema: ZodType;
    updateSchema?: ZodType;
    defaults?: Record<string, unknown>;
    toFormValues?: (row: T) => Record<string, unknown>;
    /** Custom notice for a 409 (default: message + link to `details.existingId`). */
    renderConflict?: (details: Record<string, unknown>, values: Record<string, unknown>) => ReactNode;
  };
  api: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useList: QueryHook<any, Page<T>>;
    useGet: QueryHook<{ id: number }, T>;
    useHistory?: QueryHook<{ id: number }, EntityHistory>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create?: { useMutation: MutationHook<any, T>; toArg: (values: any) => unknown };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update?: { useMutation: MutationHook<any, T>; toArg: (id: number, values: any) => unknown };
  };
  workflow?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDefinition: QueryHook<any, WorkflowDefinition>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transition: { useMutation: MutationHook<any, T>; toArg: (id: number, action: string, comment?: string) => unknown };
    /** Steps left off the progress bar for some users (e.g. "Visited" for walk-in salespeople). */
    hiddenStates?: (perm: PermissionApi) => string[];
  };
}

/** May the user edit this row (UI gating; the server re-checks)? */
export function canEditRow<T extends { id: number }>(config: EntityViewConfig<T>, perm: PermissionApi, row: T): boolean {
  const codes = config.permissions.update ?? [];
  if (!config.api.update || !codes.length) return false;
  if (config.canEdit) return config.canEdit(row, perm);
  if (!config.scope) return codes.some((c) => perm.isGlobal(c));
  const d = row[config.scope.dealershipKey] as unknown as number;
  const b = config.scope.branchKey ? (row[config.scope.branchKey] as unknown as number | null) : undefined;
  const isOwn = !!config.ownerKey && (row[config.ownerKey] as unknown) === perm.userId;
  return codes.some((c) => (!c.endsWith('_own') || isOwn) && perm.canIn(c, d, b));
}
