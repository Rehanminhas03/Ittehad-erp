/**
 * Leave applications (sick / emergency leave) for every member of the sales department: the
 * salesperson, CRO, Sales Admin, Delivery Team, Assistant Manager and Manager apply for themselves;
 * the Assistant Manager / Manager (sales.leave.approve) approve or reject the team's applications.
 * Each one prints on the dealership's leave form (Document formats → Leave form). Later this can feed
 * the accounts / payroll module.
 */
import { scopeWhere } from '../../../auth/access';
import { query } from '../../../db/client';
import { and, eq, or, sql, type SQL } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { DocType, nextDocumentNumber } from '../../core/documents';
import { leaveApplication } from '../../../db/tables.generated';
import { SalesPerm as P } from '../permissions';
import type { LeaveApplicationCreate, LeaveDecisionBody, LeaveListQuery } from '../schemas';
import { loadTemplate } from './templates';

type Row = {
  id: number;
  dealershipId: number;
  dealershipName: string;
  applicationNo: string;
  employeeId: number;
  employeeName: string;
  employeeNo: string | null;
  department: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: string;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionNote: string | null;
  createdAt: Date;
};

/** The applications the caller may see: their own, and (approvers) their dealerships'. */
function visible(ctx: EntityCtx): SQL {
  const own = eq(leaveApplication.employeeId, ctx.access.userId)!;
  const team = scopeWhere(ctx.access.scope(P.leaveApprove), { dealership: leaveApplication.dealershipId });
  return or(own, team)!;
}

const SELECT = sql`select la.id::int as id, la.dealership_id::int as "dealershipId", d.name as "dealershipName", la.application_no as "applicationNo",
         la.employee_id::int as "employeeId", e.full_name as "employeeName", la.employee_no as "employeeNo", la.department,
         la.leave_type as "leaveType", la.from_date::text as "fromDate", la.to_date::text as "toDate", la.days, la.reason, la.status,
         la.decided_at as "decidedAt", dec.full_name as "decidedByName", la.decision_note as "decisionNote", la.created_at as "createdAt"
    from ${leaveApplication} la
    join core.dealership d on d.id = la.dealership_id
    join core."user" e on e.id = la.employee_id
    left join core."user" dec on dec.id = la.decided_by_id`;

/** The scope condition names the table in full; rewrite it for the alias "la". */
const aliased = (cond: SQL): SQL => sql`(select true from ${leaveApplication} where ${leaveApplication.id} = la.id and ${cond})`;

export async function listLeave(ctx: EntityCtx, q: z.output<typeof LeaveListQuery>) {
  const conds: (SQL | undefined)[] = [aliased(visible(ctx))];
  if (q.dealershipId) conds.push(sql`la.dealership_id = ${q.dealershipId}`);
  if (q.status) conds.push(sql`la.status = ${q.status}`);
  if (q.mine) conds.push(sql`la.employee_id = ${ctx.access.userId}`);
  const where = and(...conds)!;
  const rows = await query<Row>(
    ctx.tx,
    sql`${SELECT} where ${where} order by la.created_at desc, la.id desc limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`,
  );
  const [{ total } = { total: 0 }] = await query<{ total: number }>(ctx.tx, sql`select count(*)::int as total from ${leaveApplication} la where ${where}`);
  return { items: rows, total, page: q.page, pageSize: q.pageSize };
}

export async function getLeave(ctx: EntityCtx, id: number) {
  const [row] = await query<Row>(ctx.tx, sql`${SELECT} where la.id = ${id} and ${aliased(visible(ctx))}`);
  if (!row) throw notFound('Leave application');
  return row;
}

/** Inclusive days between two dates (YYYY-MM-DD). */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

export async function applyForLeave(ctx: EntityCtx, input: z.output<typeof LeaveApplicationCreate>) {
  const { dealershipId } = input;
  if (!ctx.access.canIn(P.leaveApply, { dealershipId })) throw forbidden('You cannot apply for leave at this dealership');
  if (input.toDate < input.fromDate) throw validationError([{ in: 'body', path: 'toDate', message: 'The last day must be on or after the first day' }]);
  const days = daysBetween(input.fromDate, input.toDate);
  if (days > 60) throw validationError([{ in: 'body', path: 'toDate', message: 'At most 60 days in one application' }]);
  const me = await ctx.tx.user.findUnique({ where: { id: ctx.access.userId }, select: { employeeCode: true } });
  const row = await ctx.tx.leaveApplication.create({
    data: {
      dealershipId,
      applicationNo: await nextDocumentNumber(ctx.tx, dealershipId, DocType.leaveApplication),
      employeeId: ctx.access.userId,
      employeeNo: input.employeeNo ?? me?.employeeCode ?? null,
      department: input.department,
      leaveType: input.leaveType,
      fromDate: new Date(`${input.fromDate}T00:00:00Z`),
      toDate: new Date(`${input.toDate}T00:00:00Z`),
      days,
      reason: input.reason ?? null,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    },
    select: { id: true, applicationNo: true },
  });
  await ctx.audit({
    entityType: 'sales.leave',
    entityId: row.id,
    action: 'create',
    dealershipId,
    changes: { applicationNo: row.applicationNo, leaveType: input.leaveType, fromDate: input.fromDate, toDate: input.toDate, days },
  });
  return getLeave(ctx, row.id);
}

export async function decideLeave(ctx: EntityCtx, id: number, input: z.output<typeof LeaveDecisionBody>) {
  const l = await getLeave(ctx, id);
  if (!ctx.access.canIn(P.leaveApprove, { dealershipId: l.dealershipId })) throw forbidden('Only the Assistant Manager or the Manager decide leave');
  if (l.employeeId === ctx.access.userId) throw forbidden('Your own leave is decided by someone else');
  if (l.status !== 'submitted') throw conflict(`This application is already ${l.status}`);
  if (!input.approve && !input.note) throw validationError([{ in: 'body', path: 'note', message: 'Give the reason for rejecting' }]);
  await ctx.tx.leaveApplication.update({
    where: { id },
    data: { status: input.approve ? 'approved' : 'rejected', decidedAt: new Date(), decidedById: ctx.access.userId, decisionNote: input.note ?? null, updatedById: ctx.access.userId },
  });
  await ctx.audit({
    entityType: 'sales.leave',
    entityId: id,
    action: input.approve ? 'approve' : 'reject',
    dealershipId: l.dealershipId,
    changes: { applicationNo: l.applicationNo, note: input.note ?? null },
  });
  return getLeave(ctx, id);
}

/** What the printed leave form shows: the application and the dealership's leave format. */
export async function leaveDocument(ctx: EntityCtx, id: number) {
  const l = await getLeave(ctx, id);
  return { ...l, template: await loadTemplate(ctx, l.dealershipId, 'leave') };
}
