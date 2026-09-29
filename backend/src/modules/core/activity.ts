/**
 * Activity log: what people did (sign-ins and sign-outs, leads, orders, deliveries, user changes),
 * read from the audit log. Everyone sees their own activity; holders of core.activity.view_team also
 * see everyone's within their scope (e.g. a Sales Manager, their dealership).
 *
 * Modules register how to name their records (a lead's customer, an order number) so entries read
 * well without core depending on them: see registerActivityLabels.
 */
import { scopeWhere } from '../../auth/access';
import { type Executor, query } from '../../db/client';
import { type SQL, and, eq, ilike, inArray, notInArray, or, sql } from '../../db/sql';
import { escapeLike } from '../../entity/entityService';
import type { EntityCtx } from '../../entity/types';
import type { z } from '../../lib/zod';
import { auditLog, dealership, user } from './models';
import { CorePerm } from './permissions';
import type { ActivityQuery, TeamActivityQuery } from './schemas';

type LabelResolver = (ex: Executor, ids: string[]) => Promise<Map<string, string>>;
const labelResolvers = new Map<string, LabelResolver>();

/** Called by modules at load time: readable names for their entity ids. */
export function registerActivityLabels(entityType: string, resolve: LabelResolver) {
  labelResolvers.set(entityType, resolve);
}
registerActivityLabels('core.user', async (ex, ids) => {
  const rows = await ex.user.findMany({ where: { id: { in: ids.map(Number).filter(Boolean) } }, select: { id: true, fullName: true } });
  return new Map(rows.map((r) => [String(r.id), r.fullName]));
});

const SIGN_IN_ACTIONS = ['login', 'login.dev', 'login.failed', 'login.blocked', 'logout', 'password.change'];

function categoryCondition(category: z.output<typeof ActivityQuery>['category']): SQL | undefined {
  switch (category) {
    case 'sign_in':
      return and(eq(auditLog.entityType, 'core.user'), inArray(auditLog.action, SIGN_IN_ACTIONS));
    case 'users':
      return and(eq(auditLog.entityType, 'core.user'), notInArray(auditLog.action, SIGN_IN_ACTIONS));
    case 'leads':
      return eq(auditLog.entityType, 'sales.lead');
    case 'documents':
      return inArray(auditLog.entityType, ['sales.quotation', 'sales.ppf_form', 'sales.document_template', 'sales.vehicle_variant']);
    case 'orders':
      return eq(auditLog.entityType, 'sales.order');
    case 'deliveries':
      return eq(auditLog.entityType, 'sales.delivery');
    case 'stock':
      return inArray(auditLog.entityType, ['sales.stock_vehicle', 'master.vehicle']);
    default:
      return undefined;
  }
}

/** Pakistan calendar days, inclusive. */
function dateConditions(from?: string, to?: string): SQL[] {
  const day = sql`(${auditLog.occurredAt} at time zone 'Asia/Karachi')::date`;
  return [from ? sql`${day} >= ${from}::date` : undefined, to ? sql`${day} <= ${to}::date` : undefined].filter(Boolean) as SQL[];
}

interface ActivityRow {
  id: number;
  occurredAt: Date;
  actorId: number | null;
  actorName: string | null;
  dealershipId: number | null;
  dealershipName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  changes: unknown;
  ip: string | null;
}

async function page(ctx: EntityCtx, where: SQL, q: { page: number; pageSize: number }, withIp: boolean) {
  const rows = await query<ActivityRow>(
    ctx.tx,
    sql`select ${auditLog.id} as "id", ${auditLog.occurredAt} as "occurredAt", ${auditLog.actorId} as "actorId",
               ${user.fullName} as "actorName", ${auditLog.dealershipId} as "dealershipId", ${dealership.name} as "dealershipName",
               ${auditLog.entityType} as "entityType", ${auditLog.entityId} as "entityId", ${auditLog.action} as "action",
               ${auditLog.changes} as "changes", ${auditLog.ip} as "ip"
          from ${auditLog}
          left join ${user} on ${user.id} = ${auditLog.actorId}
          left join ${dealership} on ${dealership.id} = ${auditLog.dealershipId}
         where ${where}
         order by ${auditLog.occurredAt} desc, ${auditLog.id} desc
         limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`,
  );
  const [{ total } = { total: 0 }] = await query<{ total: number }>(
    ctx.tx,
    sql`select count(*)::int as "total" from ${auditLog} left join ${user} on ${user.id} = ${auditLog.actorId} where ${where}`,
  );

  // Readable record names, one query per entity type on the page.
  const labels = new Map<string, string>();
  const byType = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!labelResolvers.has(r.entityType)) continue;
    if (!byType.has(r.entityType)) byType.set(r.entityType, new Set());
    byType.get(r.entityType)!.add(r.entityId);
  }
  for (const [type, ids] of byType) {
    for (const [id, label] of await labelResolvers.get(type)!(ctx.tx, [...ids])) labels.set(`${type}:${id}`, label);
  }

  const items = rows.map((r) => ({ ...r, entityLabel: labels.get(`${r.entityType}:${r.entityId}`) ?? null, ip: withIp ? r.ip : null }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** The caller's own activity, everywhere. */
export function myActivity(ctx: EntityCtx, q: z.output<typeof ActivityQuery>) {
  const where = and(eq(auditLog.actorId, ctx.access.userId), categoryCondition(q.category), ...dateConditions(q.from, q.to))!;
  return page(ctx, where, q, true);
}

/** Everyone's activity within the caller's core.activity.view_team scope, filterable by person. */
export function teamActivity(ctx: EntityCtx, q: z.output<typeof TeamActivityQuery>) {
  const scope = scopeWhere(ctx.access.scope(CorePerm.activityViewTeam), { dealership: auditLog.dealershipId, branch: auditLog.branchId });
  const conds: (SQL | undefined)[] = [scope, categoryCondition(q.category), ...dateConditions(q.from, q.to)];
  if (q.actorId) conds.push(eq(auditLog.actorId, q.actorId));
  if (q.q) {
    const p = `%${escapeLike(q.q)}%`;
    conds.push(or(ilike(user.fullName, p), ilike(user.email, p)));
  }
  return page(ctx, and(...conds)!, q, true);
}
