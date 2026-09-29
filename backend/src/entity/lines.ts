import { query } from '../db/client';
import { delegateOf, pickColumns } from '../db/delegate';
import { sql } from '../db/sql';
import type { ZodObject } from 'zod';
import { ApiRouter } from '../http/apiRouter';
import { conflict, forbidden, notFound, validationError } from '../lib/errors';
import { IdParam, z } from '../lib/zod';
import { diffChanges } from '../modules/core/audit';
import type { EntityService } from './entityService';
import type { AnyTable, EntityCtx, Row } from './types';

/**
 * Child lines of a document (estimate lines, job card lines, PO lines, invoice lines...).
 * Lines live and die with their parent: they are read with the parent's view rights, edited
 * with the parent's edit rights, locked by the parent's state, and audited on the parent.
 */
export interface LineConfig {
  parent: EntityService;
  /** Line table; must have `id`, `dealershipId` and the parent key column. */
  table: AnyTable;
  /** Property key of the column referencing the parent. */
  parentKey: string;
  names: { singular: string; plural: string };
  schemas: { read: ZodObject; create: ZodObject; update: ZodObject };
  /** Permission(s) on the parent row needed to change lines (second = "own" variant). */
  editPermission: string;
  editOwnPermission?: string;
  maxLines: number;
  /** Order lines are listed in. */
  sortKey: string;
  /** Returns why the parent's lines cannot change right now, or null. */
  locked?: (parent: Row) => string | null;
  /** Returns why this particular line cannot be edited/removed (e.g. customer-approved work), or null. */
  lineLocked?: (line: Row) => string | null;
  /** Validates/derives stored fields (e.g. amount = qty x price). */
  prepare?: (ctx: EntityCtx, parent: Row, data: Record<string, unknown>, before?: Row) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Runs after any change (e.g. recompute the parent's totals). */
  afterChange?: (ctx: EntityCtx, parent: Row) => Promise<void>;
}

export class LineService {
  constructor(readonly config: LineConfig) {
    for (const k of ['id', 'dealershipId', config.parentKey, config.sortKey]) {
      if (!config.table.$meta.columns[k]) throw new Error(`${config.names.plural}: unknown column "${k}"`);
    }
  }

  private lines(ctx: EntityCtx) {
    return delegateOf(ctx.tx, this.config.table);
  }

  async list(ctx: EntityCtx, parentId: number): Promise<Row[]> {
    const { parentKey, sortKey, maxLines } = this.config;
    return this.lines(ctx).findMany({
      where: { [parentKey]: parentId },
      orderBy: [{ [sortKey]: 'asc' }, { id: 'asc' }],
      take: maxLines,
    });
  }

  /** Visible parent, write-authorised and not locked. */
  async editableParent(ctx: EntityCtx, parentId: number): Promise<Row> {
    const { parent, editPermission, editOwnPermission, locked } = this.config;
    const p = await parent.findVisible(ctx, parentId, { lock: true });
    if (!parent.canOnRow(ctx.access, p, editPermission, editOwnPermission)) throw forbidden();
    const reason = locked?.(p);
    if (reason) throw conflict(reason);
    return p;
  }

  private audit(ctx: EntityCtx, parent: Row, action: string, changes: unknown) {
    return ctx.audit({
      entityType: this.config.parent.config.entityType,
      entityId: parent.id,
      action,
      ...this.config.parent.auditTenant(parent),
      changes,
    });
  }

  async add(ctx: EntityCtx, parentId: number, input: Record<string, unknown>, opts: { skipLock?: boolean } = {}): Promise<Row> {
    const p = opts.skipLock ? await this.config.parent.findById(ctx, parentId, { lock: true }) : await this.editableParent(ctx, parentId);
    const n = await this.lines(ctx).count({ where: { [this.config.parentKey]: parentId } });
    if (n >= this.config.maxLines) throw validationError([{ in: 'body', path: '', message: `At most ${this.config.maxLines} lines` }]);
    const data = this.config.prepare ? await this.config.prepare(ctx, p, input) : input;
    const row = await this.lines(ctx).create({
      data: pickColumns(this.config.table, { ...data, [this.config.parentKey]: parentId, dealershipId: p.dealershipId }),
    });
    await this.audit(ctx, p, 'line.add', { lineId: row.id, ...input });
    await this.config.afterChange?.(ctx, p);
    return row;
  }

  private async findLine(ctx: EntityCtx, parentId: number, lineId: number): Promise<Row> {
    const { table, parentKey } = this.config;
    // Locked for the rest of the transaction, like the parent.
    await query(ctx.tx, sql`select 1 from ${table} where ${table.id} = ${lineId} and ${(table as unknown as Record<string, typeof table.id>)[parentKey]!} = ${parentId} for update`);
    const row = await this.lines(ctx).findFirst({ where: { id: lineId, [parentKey]: parentId } });
    if (!row) throw notFound(this.config.names.singular);
    const reason = this.config.lineLocked?.(row);
    if (reason) throw conflict(reason);
    return row;
  }

  async update(ctx: EntityCtx, parentId: number, lineId: number, input: Record<string, unknown>): Promise<Row> {
    const p = await this.editableParent(ctx, parentId);
    const before = await this.findLine(ctx, parentId, lineId);
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const data = this.config.prepare ? await this.config.prepare(ctx, p, { ...before, ...patch }, before) : patch;
    const changes = diffChanges(before, data);
    if (!Object.keys(changes).length) return before;
    const row = await this.lines(ctx).update({ where: { id: lineId }, data: pickColumns(this.config.table, data) });
    await this.audit(ctx, p, 'line.update', { lineId, ...changes });
    await this.config.afterChange?.(ctx, p);
    return row;
  }

  async remove(ctx: EntityCtx, parentId: number, lineId: number): Promise<void> {
    const p = await this.editableParent(ctx, parentId);
    const before = await this.findLine(ctx, parentId, lineId);
    await this.lines(ctx).delete({ where: { id: lineId } });
    await this.audit(ctx, p, 'line.remove', before);
    await this.config.afterChange?.(ctx, p);
  }
}

/**
 * Line routes under the parent:
 *   GET    /:id/lines            list (parent's view permissions)
 *   POST   /:id/lines            add
 *   PATCH  /:id/lines/:lineId    update
 *   DELETE /:id/lines/:lineId    remove
 */
export function buildLineRouter(config: LineConfig, service = new LineService(config)) {
  const parent = config.parent.config;
  const router = new ApiRouter(`/${parent.module}/${parent.path}`, parent.names.singular);
  const viewPerms = [parent.permissions.view, parent.permissions.viewOwn].filter((x): x is string => !!x);
  const editPerms = [config.editPermission, config.editOwnPermission].filter((x): x is string => !!x);
  const LineParams = IdParam.extend({ lineId: z.coerce.number().int().positive() });
  const Read = config.schemas.read.openapi(config.names.singular);

  router
    .route({
      method: 'get',
      path: '/:id/lines',
      operationId: `list${parent.names.singular}Lines`,
      summary: `Lines of a ${parent.names.singular} (bounded to ${config.maxLines})`,
      permission: viewPerms,
      params: IdParam,
      response: z.array(Read),
      handler: async (ctx) => {
        await config.parent.findVisible(ctx, ctx.params.id);
        return service.list(ctx, ctx.params.id);
      },
    })
    .route({
      method: 'post',
      path: '/:id/lines',
      operationId: `add${parent.names.singular}Line`,
      summary: `Add a line to a ${parent.names.singular}`,
      permission: editPerms,
      params: IdParam,
      body: config.schemas.create,
      response: Read,
      status: 201,
      handler: (ctx) => service.add(ctx, ctx.params.id, ctx.body as Record<string, unknown>),
    })
    .route({
      method: 'patch',
      path: '/:id/lines/:lineId',
      operationId: `update${parent.names.singular}Line`,
      summary: `Update a ${parent.names.singular} line`,
      permission: editPerms,
      params: LineParams,
      body: config.schemas.update,
      response: Read,
      handler: (ctx) => service.update(ctx, ctx.params.id, ctx.params.lineId, ctx.body as Record<string, unknown>),
    })
    .route({
      method: 'delete',
      path: '/:id/lines/:lineId',
      operationId: `remove${parent.names.singular}Line`,
      summary: `Remove a ${parent.names.singular} line`,
      permission: editPerms,
      params: LineParams,
      handler: (ctx) => service.remove(ctx, ctx.params.id, ctx.params.lineId),
    });
  return { router, service };
}
