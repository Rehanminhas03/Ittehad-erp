import { type Request, type RequestHandler, type Response, Router } from 'express';
import type { ZodObject, ZodType, z } from 'zod';
import type { Access } from '../auth/access';
import { authenticate } from '../auth/middleware';
import { isKnownPermission } from '../auth/permissions';
import { type Tx, db, withTenantTx } from '../db/client';
import { forbidden, validationError } from '../lib/errors';
import { type AuditEntry, writeAudit } from '../modules/core/audit';
import { createNotifications, publishNotifications } from '../modules/core/notifications';
import { ApiErrorSchema, registry } from './openapi';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Infer<T> = T extends ZodType ? z.output<T> : undefined;

/**
 * Every authenticated route must state its requirement explicitly:
 * - a permission code, or a list (caller needs at least one); row/tenant scope is then
 *   enforced inside the handler/service, or
 * - 'authenticated' for self-service endpoints (e.g. /auth/me) that return only the caller's data.
 */
export type PermissionRequirement = string | readonly string[] | 'authenticated';

export interface RouteCtx<P, Q, B> {
  req: Request;
  res: Response;
  access: Access;
  tx: Tx;
  params: P;
  query: Q;
  body: B;
  audit(entry: AuditEntry): Promise<void>;
}

export interface PublicRouteCtx<P, Q, B> {
  req: Request;
  res: Response;
  tx: Tx;
  params: P;
  query: Q;
  body: B;
}

interface BaseSpec<P, Q, B> {
  method: Method;
  path: string;
  operationId: string;
  summary: string;
  params?: P;
  query?: Q;
  body?: B;
  response?: ZodType;
  /** Success status; routes returning undefined respond 204. */
  status?: number;
}

export interface RouteSpec<P, Q, B> extends BaseSpec<P, Q, B> {
  permission: PermissionRequirement;
  handler: (ctx: RouteCtx<Infer<P>, Infer<Q>, Infer<B>>) => Promise<unknown>;
}

export interface PublicRouteSpec<P, Q, B> extends BaseSpec<P, Q, B> {
  handler: (ctx: PublicRouteCtx<Infer<P>, Infer<Q>, Infer<B>>) => Promise<unknown>;
}

export interface RouteInfo {
  method: Method;
  path: string;
  operationId: string;
  permission: PermissionRequirement | 'public';
}

function parse<T>(schema: T | undefined, value: unknown, where: string): Infer<T> {
  if (!schema) return undefined as Infer<T>;
  const result = (schema as unknown as ZodType).safeParse(value);
  if (!result.success) {
    throw validationError(result.error.issues.map((i) => ({ in: where, path: i.path.join('.'), message: i.message })));
  }
  return result.data as Infer<T>;
}

export class ApiRouter {
  static readonly all: ApiRouter[] = [];
  readonly router = Router();
  readonly routes: RouteInfo[] = [];

  /** @param basePath mounted at `/api${basePath}` */
  constructor(
    readonly basePath: string,
    readonly tag: string,
  ) {
    ApiRouter.all.push(this);
  }

  get mountPath(): string {
    return `/api${this.basePath}`;
  }

  route<P extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined, B extends ZodType | undefined = undefined>(
    spec: RouteSpec<P, Q, B>,
  ): this {
    const required = spec.permission === 'authenticated' ? [] : typeof spec.permission === 'string' ? [spec.permission] : [...spec.permission];
    for (const code of required) {
      if (!isKnownPermission(code)) throw new Error(`${spec.operationId}: unknown permission "${code}"`);
    }
    if (spec.permission !== 'authenticated' && required.length === 0) {
      throw new Error(`${spec.operationId}: permission list must not be empty`);
    }

    const handler: RequestHandler = async (req, res) => {
      const access = req.access!;
      if (required.length && !access.hasAny(required)) throw forbidden();
      const params = parse(spec.params, req.params, 'params');
      const query = parse(spec.query, req.query, 'query');
      const body = parse(spec.body, req.body, 'body');
      // Every change this request records also becomes a notification for the dealership's other
      // users: saved in the same transaction, pushed live only once it is committed.
      const changes: AuditEntry[] = [];
      let saved: Awaited<ReturnType<typeof createNotifications>> = [];
      const result = await withTenantTx(access.tenantContext(), async (tx) => {
        const out = await spec.handler({
          req,
          res,
          access,
          tx,
          params,
          query,
          body,
          audit: (entry) => {
            changes.push(entry);
            return writeAudit(tx, { actorId: access.userId, requestId: req.requestId, ip: req.ip }, entry);
          },
        });
        if (changes.length) saved = await createNotifications(tx, access.userId, changes);
        return out;
      });
      publishNotifications(saved);
      send(res, result, spec.status);
    };
    this.register(spec, spec.permission, true);
    this.router[spec.method](spec.path, authenticate, handler);
    return this;
  }

  publicRoute<P extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined, B extends ZodType | undefined = undefined>(
    spec: PublicRouteSpec<P, Q, B>,
  ): this {
    const handler: RequestHandler = async (req, res) => {
      const params = parse(spec.params, req.params, 'params');
      const query = parse(spec.query, req.query, 'query');
      const body = parse(spec.body, req.body, 'body');
      const result = await db.transaction((tx) => spec.handler({ req, res, tx, params, query, body }));
      send(res, result, spec.status);
    };
    this.register(spec, 'public', false);
    this.router[spec.method](spec.path, handler);
    return this;
  }

  private register(spec: BaseSpec<unknown, unknown, unknown>, permission: RouteInfo['permission'], secured: boolean) {
    const fullPath = `${this.mountPath}${spec.path === '/' ? '' : spec.path}`;
    this.routes.push({ method: spec.method, path: fullPath, operationId: spec.operationId, permission });
    const status = String(spec.status ?? (spec.response ? 200 : 204));
    const errorResponse = (description: string) => ({
      description,
      content: { 'application/json': { schema: ApiErrorSchema } },
    });
    registry.registerPath({
      method: spec.method,
      path: fullPath.replace(/:(\w+)/g, '{$1}'),
      operationId: spec.operationId,
      summary: spec.summary,
      description: permission === 'public' ? 'Public' : `Requires: ${permission === 'authenticated' ? 'authenticated user' : [permission].flat().join(' | ')}`,
      tags: [this.tag],
      security: secured ? [{ bearerAuth: [] }] : undefined,
      request: {
        params: spec.params as ZodObject | undefined,
        query: spec.query as ZodObject | undefined,
        body: spec.body ? { content: { 'application/json': { schema: spec.body as ZodType } } } : undefined,
      },
      responses: {
        [status]: spec.response
          ? { description: 'Success', content: { 'application/json': { schema: spec.response } } }
          : { description: 'Success' },
        ...(secured ? { 401: errorResponse('Unauthenticated'), 403: errorResponse('Forbidden') } : {}),
        422: errorResponse('Validation error'),
      },
    });
  }
}

function send(res: Response, result: unknown, status?: number) {
  if (result === undefined) res.status(status ?? 204).end();
  else res.status(status ?? 200).json(result);
}
