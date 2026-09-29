import { type Access, type ScopeTarget, scopeWhere, viewWhere } from '../auth/access';
import { type Executor, query } from '../db/client';
import { delegateOf, pickColumns } from '../db/delegate';
import { type SQL, and, eq, ilike, or, raw, sql } from '../db/sql';
import { conflict, forbidden, notFound, validationError } from '../lib/errors';
import { type Page, type PageQuery, offsetOf } from '../lib/pagination';
import { diffChanges } from '../modules/core/audit';
import type { EntityConfig, EntityCtx, Row, WorkflowTransitionDef } from './types';

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Generic, config-driven data access with authorization. Used by the generated entity routers
 * and directly by module services that need custom endpoints over the same rules.
 *
 * Rows are read and written through the model's Prisma delegate; the dynamic parts (the caller's
 * view scope, search and list filters) are SQL conditions run through Prisma ($queryRaw) to find
 * the matching ids.
 */
export class EntityService {
  readonly cols: Record<string, SQL>;

  constructor(readonly config: EntityConfig) {
    const known = config.table.$meta.columns;
    this.cols = Object.fromEntries(Object.keys(known).map((k) => [k, (config.table as unknown as Record<string, SQL>)[k]!]));
    const need = [
      'id',
      config.tenant?.dealershipKey,
      config.tenant?.branchKey,
      config.ownerKey,
      config.workflow?.stateKey,
      ...(config.search ?? []),
      ...config.sort.keys,
      ...Object.values(config.filters ?? {}).map((f) => f.key),
    ].filter((k): k is string => !!k);
    for (const key of need) {
      if (!this.cols[key]) throw new Error(`${config.entityType}: unknown column key "${key}"`);
    }
    if (!config.sort.keys.includes(config.sort.default.replace(/^-/, ''))) {
      throw new Error(`${config.entityType}: default sort must be one of sort.keys`);
    }
  }

  private col(key: string): SQL {
    return this.cols[key]!;
  }

  private delegate(ex: Executor) {
    return delegateOf(ex, this.config.table);
  }

  /** Server-side read scope: tenant + own/all + RLS underneath. */
  viewCondition(access: Access): SQL {
    const { tenant, permissions, ownerKey, linkedScope } = this.config;
    const viewCodes = [permissions.view, permissions.viewOwn].filter(Boolean) as string[];
    if (linkedScope) return linkedScope.view(access, viewCodes);
    if (!tenant) return access.hasAny(viewCodes) ? sql`true` : sql`false`;
    const cols = { dealership: this.col(tenant.dealershipKey), branch: tenant.branchKey ? this.col(tenant.branchKey) : undefined };
    const base = viewWhere(access, cols, permissions, ownerKey ? this.col(ownerKey) : undefined);
    if (!permissions.viewWhen) return base;
    return or(base, and(scopeWhere(access.scope(permissions.viewWhen.code), cols), permissions.viewWhen.condition))!;
  }

  targetOf(row: Record<string, unknown>): ScopeTarget {
    const t = this.config.tenant!;
    return {
      dealershipId: row[t.dealershipKey] as number,
      branchId: t.branchKey ? ((row[t.branchKey] as number | null | undefined) ?? null) : undefined,
    };
  }

  /** May the caller perform `perm` (or `permOwn` on own rows) on this row? */
  canOnRow(access: Access, row: Record<string, unknown>, perm?: string, permOwn?: string): boolean {
    const { tenant, ownerKey } = this.config;
    if (!tenant) return !!perm && access.hasGlobal(perm);
    const target = this.targetOf(row);
    if (perm && access.canIn(perm, target)) return true;
    return !!permOwn && !!ownerKey && row[ownerKey] === access.userId && access.canIn(permOwn, target);
  }

  /** May the caller run this transition on this row (permission, or ownPermission on own rows)? */
  canTransition(access: Access, row: Row, t: WorkflowTransitionDef): boolean {
    if (!this.config.tenant) return access.hasGlobal(t.permission);
    return this.canOnRow(access, row, t.permission, t.ownPermission);
  }

  availableActions(access: Access, row: Row): WorkflowTransitionDef[] {
    const wf = this.config.workflow;
    if (!wf) return [];
    const state = row[wf.stateKey] as string;
    return wf.transitions.filter((t) => !t.system && t.from.includes(state) && this.canTransition(access, row, t));
  }

  async present(ctx: EntityCtx, rows: Row[]): Promise<Row[]> {
    const decorated = this.config.hooks?.decorate ? await this.config.hooks.decorate(ctx, rows) : rows;
    if (!this.config.workflow) return decorated;
    return decorated.map((r) => ({ ...r, availableActions: this.availableActions(ctx.access, r).map((t) => t.action) }));
  }

  /** Rows by id, in the given order (one Prisma query). */
  private async rowsById(ex: Executor, ids: number[]): Promise<Row[]> {
    if (!ids.length) return [];
    const rows = await this.delegate(ex).findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is Row => !!r);
  }

  async list(ctx: EntityCtx, q: PageQuery, filters: Record<string, unknown> = {}, extra?: SQL): Promise<Page<Row>> {
    const { config } = this;
    const conds: (SQL | undefined)[] = [this.viewCondition(ctx.access)];
    if (extra) conds.push(extra);
    const term = q.q && config.normalizeSearch ? config.normalizeSearch(q.q) : q.q;
    if (term && config.search?.length) {
      const pattern = `%${escapeLike(term)}%`;
      conds.push(or(...config.search.map((k) => ilike(this.col(k), pattern))));
    }
    for (const [param, value] of Object.entries(filters)) {
      const f = config.filters?.[param];
      if (f && value !== undefined) conds.push(f.where ? f.where(value) : eq(this.col(f.key), value));
    }
    const where = and(...conds) ?? sql`true`;

    const sortSpec = q.sort ?? config.sort.default;
    const sortKey = sortSpec.replace(/^-/, '');
    if (!config.sort.keys.includes(sortKey)) {
      throw validationError([{ in: 'query', path: 'sort', message: `Sortable by: ${config.sort.keys.join(', ')}` }]);
    }
    const dir = raw(sortSpec.startsWith('-') ? 'desc' : 'asc');

    // Sequential: a transaction is one connection, which runs one query at a time anyway.
    const page = await query<{ id: number }>(
      ctx.tx,
      sql`select ${this.col('id')} as id from ${config.table} where ${where}
           order by ${this.col(sortKey)} ${dir}, ${this.col('id')} ${dir}
           limit ${q.pageSize} offset ${offsetOf(q)}`,
    );
    const [{ total } = { total: 0 }] = await query<{ total: number }>(ctx.tx, sql`select count(*)::int as total from ${config.table} where ${where}`);
    const items = await this.rowsById(ctx.tx, page.map((r) => r.id));
    return { items: await this.present(ctx, items), total, page: q.page, pageSize: q.pageSize };
  }

  /** Loads a row the caller can see, or throws 404 (never reveals existence of out-of-scope rows). */
  async findVisible(ctx: EntityCtx, id: number, opts: { lock?: boolean; ex?: Executor } = {}): Promise<Row> {
    const ex = opts.ex ?? ctx.tx;
    const [hit] = await query<{ id: number }>(
      ex,
      sql`select ${this.col('id')} as id from ${this.config.table}
           where ${this.col('id')} = ${id} and ${this.viewCondition(ctx.access)}${opts.lock ? sql` for update` : sql``}`,
    );
    const row = hit ? await this.delegate(ex).findUnique({ where: { id } }) : null;
    if (!row) throw notFound(this.config.names.singular);
    return row;
  }

  /** Server-internal lookup without the caller's view scope (RLS still applies). */
  async findById(ctx: EntityCtx, id: number, opts: { lock?: boolean } = {}): Promise<Row> {
    if (opts.lock) await query(ctx.tx, sql`select 1 from ${this.config.table} where ${this.col('id')} = ${id} for update`);
    const row = await this.delegate(ctx.tx).findUnique({ where: { id } });
    if (!row) throw notFound(this.config.names.singular);
    return row;
  }

  async get(ctx: EntityCtx, id: number): Promise<Row> {
    const [row] = await this.present(ctx, [await this.findVisible(ctx, id)]);
    return row!;
  }

  async create(ctx: EntityCtx, input: Record<string, unknown>): Promise<Row> {
    const { config } = this;
    const perm = config.permissions.create;
    if (!perm) throw forbidden();
    let data: Record<string, unknown> = { ...input };

    if (!config.tenant || config.tenant.root) {
      if (!ctx.access.hasGlobal(perm)) throw forbidden();
    } else if (!ctx.access.canIn(perm, this.targetOf(data))) {
      throw forbidden('You cannot create records in this dealership/branch');
    }

    if (config.hooks?.beforeCreate) data = (await config.hooks.beforeCreate(ctx, data)) ?? data;
    if (config.workflow) data[config.workflow.stateKey] = config.workflow.initial;
    if (config.tracked !== false) {
      data.createdById = ctx.access.userId;
      data.updatedById = ctx.access.userId;
    }

    const row = await this.delegate(ctx.tx).create({ data: pickColumns(config.table, data) });
    await ctx.audit({
      entityType: config.entityType,
      entityId: row.id,
      action: 'create',
      ...this.auditTenant(row),
      changes: input,
    });
    await config.hooks?.afterCreate?.(ctx, row);
    return (await this.present(ctx, [row]))[0]!;
  }

  async update(ctx: EntityCtx, id: number, input: Record<string, unknown>): Promise<Row> {
    const { config } = this;
    const before = await this.findVisible(ctx, id, { lock: true });
    let auditTenant = this.auditTenant(before);
    if (config.linkedScope) {
      const d = config.permissions.update ? await config.linkedScope.writeDealership(ctx, before, config.permissions.update) : null;
      if (d === null) throw forbidden();
      auditTenant = { dealershipId: d, branchId: null };
    } else if (!this.canOnRow(ctx.access, before, config.permissions.update, config.permissions.updateOwn)) {
      throw forbidden();
    }

    let patch: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    if (config.tenant && !config.tenant.root) {
      // Moving a record to another dealership/branch requires the same right there.
      const moved = { ...before, ...patch };
      const target = this.targetOf(moved);
      const from = this.targetOf(before);
      if ((target.dealershipId !== from.dealershipId || target.branchId !== from.branchId) &&
          !this.canOnRow(ctx.access, moved, config.permissions.update, config.permissions.updateOwn)) {
        throw forbidden('You cannot move records into this dealership/branch');
      }
    }
    if (config.hooks?.beforeUpdate) patch = (await config.hooks.beforeUpdate(ctx, before, patch)) ?? patch;

    const changes = diffChanges(before, patch);
    if (Object.keys(changes).length === 0) return (await this.present(ctx, [before]))[0]!;
    if (config.tracked !== false) patch.updatedById = ctx.access.userId;

    const row = await this.delegate(ctx.tx).update({ where: { id }, data: pickColumns(config.table, patch) });
    if (!config.linkedScope) auditTenant = this.auditTenant(row);
    await ctx.audit({ entityType: config.entityType, entityId: id, action: 'update', ...auditTenant, changes });
    await config.hooks?.afterUpdate?.(ctx, row, before);
    return (await this.present(ctx, [row]))[0]!;
  }

  async remove(ctx: EntityCtx, id: number): Promise<void> {
    const { config } = this;
    const row = await this.findVisible(ctx, id, { lock: true });
    if (!this.canOnRow(ctx.access, row, config.permissions.delete)) throw forbidden();
    await config.hooks?.beforeDelete?.(ctx, row);
    await this.delegate(ctx.tx).delete({ where: { id } });
    await ctx.audit({ entityType: config.entityType, entityId: id, action: 'delete', ...this.auditTenant(row), changes: row });
  }

  async transition(ctx: EntityCtx, id: number, action: string, comment?: string, opts: { system?: boolean } = {}): Promise<Row> {
    const { config } = this;
    const wf = config.workflow;
    if (!wf) throw notFound('Workflow');
    // System transitions are authorised by the server operation that runs them (e.g. completing a
    // delivery moves its order), so they do not require view rights on this entity. RLS still applies.
    const row = opts.system ? await this.findById(ctx, id, { lock: true }) : await this.findVisible(ctx, id, { lock: true });
    const state = row[wf.stateKey] as string;
    const t = wf.transitions.find((x) => x.action === action);
    // System transitions are only run by server code (e.g. delivery marks the order delivered).
    if (!t || (t.system && !opts.system)) {
      throw validationError([{ in: 'body', path: 'action', message: `Unknown action "${action}"` }]);
    }
    if (!t.from.includes(state)) throw conflict(`Cannot ${t.label.toLowerCase()} a record in state "${state}"`);
    if (!opts.system && !this.canTransition(ctx.access, row, t)) throw forbidden();
    if (t.requiresComment && !comment?.trim()) {
      throw validationError([{ in: 'body', path: 'comment', message: 'A comment is required for this action' }]);
    }
    const blocked = await t.guard?.(ctx, row);
    if (blocked) throw conflict(blocked);

    const patch: Record<string, unknown> = { [wf.stateKey]: t.to };
    if (config.tracked !== false) patch.updatedById = ctx.access.userId;
    const updated = await this.delegate(ctx.tx).update({ where: { id }, data: patch });

    const tenant = this.auditTenant(updated);
    if (tenant.dealershipId != null) {
      await ctx.tx.workflowTransition.create({
        data: {
          entityType: config.entityType,
          entityId: id,
          dealershipId: tenant.dealershipId,
          action: t.action,
          fromState: state,
          toState: t.to,
          comment: comment?.trim() || null,
          actorId: ctx.access.userId,
        },
      });
    }
    await ctx.audit({
      entityType: config.entityType,
      entityId: id,
      action: `transition:${t.action}`,
      ...tenant,
      changes: { [wf.stateKey]: { from: state, to: t.to }, comment: comment?.trim() || undefined },
    });
    if (!t.effect) return (await this.present(ctx, [updated]))[0]!;
    await t.effect(ctx, updated);
    // Effects may write back to the row (e.g. the journal entry an invoice posted).
    return (await this.present(ctx, [await this.findById(ctx, id)]))[0]!;
  }

  auditTenant(row: Record<string, unknown>): { dealershipId: number | null; branchId: number | null } {
    const t = this.config.tenant;
    if (!t) return { dealershipId: null, branchId: null };
    return {
      dealershipId: (row[t.dealershipKey] as number) ?? null,
      branchId: t.branchKey ? ((row[t.branchKey] as number | null) ?? null) : null,
    };
  }
}
