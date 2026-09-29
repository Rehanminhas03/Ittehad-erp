import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import { ApiRouter } from '../http/apiRouter';
import { PageQuery, pageSchema } from '../lib/pagination';
import { IdParam, Timestamp, z } from '../lib/zod';
import { auditLog, user, workflowTransition } from '../modules/core/models';
import { EntityService } from './entityService';
import type { EntityConfig } from './types';

export const HISTORY_LIMIT = 200;

export const AuditEntrySchema = z
  .object({
    id: z.number().int(),
    occurredAt: Timestamp,
    actorId: z.number().int().nullable(),
    actorName: z.string().nullable(),
    entityType: z.string(),
    entityId: z.string(),
    action: z.string(),
    dealershipId: z.number().int().nullable(),
    branchId: z.number().int().nullable(),
    changes: z.unknown().nullable(),
  })
  .openapi('AuditEntry');

export const WorkflowTransitionSchema = z
  .object({
    id: z.number().int(),
    action: z.string(),
    fromState: z.string(),
    toState: z.string(),
    comment: z.string().nullable(),
    actorId: z.number().int(),
    actorName: z.string().nullable(),
    occurredAt: Timestamp,
  })
  .openapi('WorkflowTransition');

export const EntityHistorySchema = z
  .object({ audit: z.array(AuditEntrySchema), transitions: z.array(WorkflowTransitionSchema) })
  .openapi('EntityHistory');

export const WorkflowDefinitionSchema = z
  .object({
    stateKey: z.string(),
    initial: z.string(),
    states: z.array(z.object({ key: z.string(), label: z.string(), terminal: z.boolean().optional() })),
    transitions: z.array(
      z.object({
        action: z.string(),
        label: z.string(),
        from: z.array(z.string()),
        to: z.string(),
        requiresComment: z.boolean(),
        system: z.boolean(),
      }),
    ),
  })
  .openapi('WorkflowDefinition');

export const TransitionBody = z.object({ action: z.string().min(1), comment: z.string().max(2000).optional() });

export const entityRegistry: { config: EntityConfig; service: EntityService; router: ApiRouter }[] = [];

/**
 * Generates the standard REST surface for an entity from its config:
 *   GET    /            list (paginated, searched, filtered, sorted, scope-filtered)
 *   GET    /:id         detail (404 when outside the caller's scope)
 *   POST   /            create             (if schemas.create + permissions.create)
 *   PATCH  /:id         update             (if schemas.update + permissions.update[Own])
 *   DELETE /:id         delete             (if permissions.delete)
 *   GET    /:id/history audit + workflow history
 *   GET    /workflow    workflow definition (if workflow)
 *   POST   /:id/transitions  run a workflow action (if workflow)
 */
export function buildEntityRouter(config: EntityConfig, service = new EntityService(config)) {
  const { names, permissions: p, schemas } = config;
  // The OpenAPI tag doubles as the RTK Query cache tag: mutations invalidate this entity's queries.
  const router = new ApiRouter(`/${config.module}/${config.path}`, names.singular);
  const viewPerms = [p.view, p.viewOwn, p.viewWhen?.code].filter((x): x is string => !!x);

  // Component name without spaces ("PPF form" -> "PPFForm"), so generated client types read well.
  const schemaName = names.singular.replace(/\s+(\S)/g, (_, c: string) => c.toUpperCase());
  const Read = config.workflow
    ? schemas.read.extend({ availableActions: z.array(z.string()) }).openapi(schemaName)
    : schemas.read.openapi(schemaName);

  const filterShape = Object.fromEntries(
    Object.entries(config.filters ?? {}).map(([param, f]) => [param, f.schema.optional()]),
  );
  const ListQuery = PageQuery.extend(filterShape);

  router.route({
    method: 'get',
    path: '/',
    operationId: `list${names.plural}`,
    summary: `List ${names.plural}`,
    permission: viewPerms,
    query: ListQuery,
    response: pageSchema(Read, `${names.singular}Page`),
    handler: ({ query, ...ctx }) => {
      const { page, pageSize, sort, q, ...filters } = query as Record<string, unknown> & PageQuery;
      return service.list({ ...ctx, query, params: undefined, body: undefined }, { page, pageSize, sort, q }, filters);
    },
  });

  if (config.workflow) {
    const wf = config.workflow;
    router.route({
      method: 'get',
      path: '/workflow',
      operationId: `get${names.singular}Workflow`,
      summary: `${names.singular} workflow definition`,
      permission: viewPerms,
      response: WorkflowDefinitionSchema,
      handler: async () => ({
        stateKey: wf.stateKey,
        initial: wf.initial,
        states: wf.states.map((s) => ({ ...s })),
        transitions: wf.transitions.map((t) => ({
          action: t.action,
          label: t.label,
          from: [...t.from],
          to: t.to,
          requiresComment: !!t.requiresComment,
          system: !!t.system,
        })),
      }),
    });
  }

  router.route({
    method: 'get',
    path: '/:id',
    operationId: `get${names.singular}`,
    summary: `Get ${names.singular}`,
    permission: viewPerms,
    params: IdParam,
    response: Read,
    handler: (ctx) => service.get(ctx, ctx.params.id),
  });

  if (schemas.create && p.create) {
    router.route({
      method: 'post',
      path: '/',
      operationId: `create${names.singular}`,
      summary: `Create ${names.singular}`,
      permission: p.create,
      body: schemas.create,
      response: Read,
      status: 201,
      handler: (ctx) => service.create(ctx, ctx.body as Record<string, unknown>),
    });
  }

  const updatePerms = [p.update, p.updateOwn].filter((x): x is string => !!x);
  if (schemas.update && updatePerms.length) {
    router.route({
      method: 'patch',
      path: '/:id',
      operationId: `update${names.singular}`,
      summary: `Update ${names.singular}`,
      permission: updatePerms,
      params: IdParam,
      body: schemas.update,
      response: Read,
      handler: (ctx) => service.update(ctx, ctx.params.id, ctx.body as Record<string, unknown>),
    });
  }

  if (p.delete) {
    router.route({
      method: 'delete',
      path: '/:id',
      operationId: `delete${names.singular}`,
      summary: `Delete ${names.singular}`,
      permission: p.delete,
      params: IdParam,
      handler: (ctx) => service.remove(ctx, ctx.params.id),
    });
  }

  router.route({
    method: 'get',
    path: '/:id/history',
    operationId: `get${names.singular}History`,
    summary: `${names.singular} audit and workflow history`,
    permission: viewPerms,
    params: IdParam,
    response: EntityHistorySchema,
    handler: async (ctx) => {
      await service.findVisible(ctx, ctx.params.id);
      const audit = await ctx.tx
        .select({ ...getTableColumns(auditLog), actorName: user.fullName })
        .from(auditLog)
        .leftJoin(user, eq(user.id, auditLog.actorId))
        .where(and(eq(auditLog.entityType, config.entityType), eq(auditLog.entityId, String(ctx.params.id))))
        .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
        .limit(HISTORY_LIMIT);
      const transitions = config.workflow
        ? await ctx.tx
            .select({ ...getTableColumns(workflowTransition), actorName: user.fullName })
            .from(workflowTransition)
            .leftJoin(user, eq(user.id, workflowTransition.actorId))
            .where(and(eq(workflowTransition.entityType, config.entityType), eq(workflowTransition.entityId, ctx.params.id)))
            .orderBy(desc(workflowTransition.occurredAt), desc(workflowTransition.id))
            .limit(HISTORY_LIMIT)
        : [];
      return { audit, transitions };
    },
  });

  if (config.workflow) {
    const transitionPerms = [
      ...new Set(
        config.workflow.transitions.filter((t) => !t.system).flatMap((t) => [t.permission, t.ownPermission].filter((p): p is string => !!p)),
      ),
    ];
    router.route({
      method: 'post',
      path: '/:id/transitions',
      operationId: `transition${names.singular}`,
      summary: `Run a workflow action on ${names.singular}`,
      permission: transitionPerms,
      params: IdParam,
      body: TransitionBody,
      response: Read,
      handler: (ctx) => service.transition(ctx, ctx.params.id, ctx.body.action, ctx.body.comment),
    });
  }

  entityRegistry.push({ config, service, router });
  return { router, service };
}
