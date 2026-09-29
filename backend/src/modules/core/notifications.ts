/**
 * Notifications: every change a person makes (a new lead, a quotation, a car added to stock, an
 * approval request, a delivery, a new user…) becomes a notification for everyone else at that
 * dealership, e.g. "New lead added — by Sales 1".
 *
 * Built from the audit entries of one request (the same ones behind the Activity log), in the same
 * transaction, then pushed live over the socket once the change is saved (apiRouter). One request
 * gives one notification: the most meaningful of its entries (e.g. "Car delivered", not the
 * bookkeeping around it); many of the same kind collapse ("Variant codes added (19)").
 * Sign-ins and personal profile changes are not broadcast. Details never carry customer data.
 */
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import type { EntityCtx } from '../../entity/types';
import { notFound } from '../../lib/errors';
import { emitToUsers } from '../../lib/realtime';
import type { AuditEntry } from './audit';
import { notification, user } from './models';

type Row = typeof notification.$inferSelect;
interface Spec {
  title: string;
  /** Which entry of a request is the notification (the highest wins). */
  weight: number;
  href?: string;
  detail?: string;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
const toValue = (v: unknown) => (v && typeof v === 'object' && 'to' in (v as object) ? (v as { to: unknown }).to : v);
const words = (s: string) => s.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Not broadcast: sign-ins and a person's own profile. */
const PRIVATE = new Set(['login', 'login.dev', 'login.failed', 'login.blocked', 'logout', 'password.change', 'profile.update']);

const LEAD_STEPS: Record<string, [string, number]> = {
  convert: ['Lead converted', 90],
  visit: ['Lead marked as visited', 45],
  exhaust: ['Lead marked as exhausted', 60],
  reopen: ['Lead reopened', 60],
  follow_up: ['Lead moved to follow-up', 20],
  raise_order: ['Sales order raised for a lead', 20],
  complete: ['Lead completed (car delivered)', 20],
  order_cancelled: ['Lead back to converted (order cancelled)', 20],
};
const ORDER_STEPS: Record<string, [string, number]> = {
  submit: ['Approval requested: sales order', 80],
  approve: ['Sales order approved', 85],
  return: ['Sales order returned to draft', 70],
  cancel: ['Sales order cancelled', 75],
  deliver: ['Sales order delivered', 20],
};
const VEHICLE_STAGES: Record<string, string> = {
  booked: 'booked',
  in_transit: 'in transit',
  received: 'received',
  ready_for_delivery: 'ready for delivery',
  hold: 'on hold',
  available: 'back in free stock',
};

/** The task an audit entry stands for, or null when it is not broadcast. */
export function describeChange(e: AuditEntry): Spec | null {
  if (PRIVATE.has(e.action)) return null;
  const c = obj(e.changes);
  const id = String(e.entityId);
  const step = e.action.startsWith('transition:') ? e.action.slice('transition:'.length) : null;

  switch (e.entityType) {
    case 'core.user': {
      const href = `/admin/users/${id}`;
      if (e.action === 'create') return { title: 'New user added', weight: 70, href, detail: str(c.fullName) };
      if (e.action === 'role.assign') return { title: 'Role assigned to a user', weight: 60, href, detail: str(c.roleName) };
      if (e.action === 'role.revoke') return { title: 'Role removed from a user', weight: 55, href };
      if (e.action === 'update') {
        const active = obj(c.isActive);
        if ('to' in active) return { title: active.to ? 'User reactivated' : 'User deactivated', weight: 60, href };
        if (c.password) return { title: 'User password reset', weight: 40, href };
        return { title: 'User details updated', weight: 35, href };
      }
      break;
    }
    case 'sales.lead': {
      const href = `/sales/leads/${id}`;
      if (e.action === 'create') return { title: 'New lead added', weight: 60, href };
      if (e.action === 'update') return { title: 'Lead updated', weight: 30, href };
      if (e.action === 'follow_up') return { title: 'Follow-up recorded on a lead', weight: 35, href };
      if (e.action === 'details.update') return { title: 'Customer details corrected', weight: 40, href };
      if (e.action === 'escalate') return { title: 'Duplicate customer sent to the Assistant Manager', weight: 65, href };
      if (step && LEAD_STEPS[step]) return { title: LEAD_STEPS[step][0], weight: LEAD_STEPS[step][1], href };
      break;
    }
    case 'sales.quotation':
      if (e.action === 'create') return { title: 'Vehicle quotation created', weight: 60, href: `/sales/quotations/${id}`, detail: str(c.quotationNo) };
      if (e.action === 'update') return { title: 'Vehicle quotation updated', weight: 40, href: `/sales/quotations/${id}` };
      break;
    case 'sales.ppf_form':
      if (e.action === 'create') return { title: 'PPF voucher created', weight: 60, href: `/sales/ppf-forms/${id}`, detail: str(c.formNo) };
      if (e.action === 'update') return { title: 'PPF voucher updated', weight: 40, href: `/sales/ppf-forms/${id}` };
      break;
    case 'sales.order': {
      const href = `/sales/orders/${id}`;
      if (e.action === 'create') return { title: 'Sales order raised', weight: 70, href, detail: str(c.orderNo) };
      if (e.action === 'update') return { title: 'Sales order updated', weight: 30, href };
      if (e.action === 'vehicle.set') return { title: 'Car entered on a sales order', weight: 50, href, detail: str(c.vin) };
      if (e.action === 'allocate') return { title: 'Car allocated to a sales order', weight: 55, href };
      if (e.action === 'release') return { title: 'Car released back to stock', weight: 50, href };
      if (step && ORDER_STEPS[step]) return { title: ORDER_STEPS[step][0], weight: ORDER_STEPS[step][1], href };
      break;
    }
    case 'sales.delivery': {
      const href = `/sales/deliveries/${id}`;
      if (e.action === 'create') return { title: 'Delivery scheduled', weight: 50, href };
      if (step === 'complete') return { title: 'Car delivered', weight: 100, href };
      if (step === 'cancel') return { title: 'Delivery cancelled', weight: 60, href };
      break;
    }
    case 'sales.stock_vehicle':
      if (e.action === 'create') return { title: 'New car added to stock', weight: 70, href: `/sales/stock/${id}`, detail: str(c.vin) };
      if (e.action === 'update') return { title: 'Stock car updated', weight: 30, href: `/sales/stock/${id}` };
      break;
    case 'master.vehicle':
      if (e.action === 'status.update') {
        const stage = VEHICLE_STAGES[String(c.status)] ?? words(String(c.status ?? 'updated')).toLowerCase();
        return { title: `Car ${stage}`, weight: c.status === 'ready_for_delivery' ? 58 : 45, href: `/sales/stock/${id}` };
      }
      break;
    case 'sales.vehicle_variant':
      if (e.action === 'create') return { title: 'New variant code added', weight: 60, href: `/sales/variants/${id}`, detail: str(c.code) };
      if (e.action === 'update') return { title: 'Variant code changed', weight: 45, href: `/sales/variants/${id}` };
      break;
    case 'sales.document_template':
      // The kind (quotation / PPF voucher) is filled in by the caller from the template row.
      return { title: 'Document format changed', weight: 60, href: '/sales/document-formats' };
    case 'master.customer':
      // Created with a conversion ("Lead converted" says it); other customers are rare in Sales.
      if (e.action === 'create' && c.fromLeadId) return null;
      break;
  }
  // Anything else still counts: a plain, readable fallback.
  const [, entity = e.entityType] = e.entityType.split('.');
  return { title: `${words(entity)} ${step ? words(step).toLowerCase() : e.action === 'create' ? 'added' : e.action === 'delete' ? 'deleted' : 'updated'}`, weight: 10 };
}

/** Sales templates carry their kind on the row, not in the audit entry. */
async function templateTitle(ex: Executor, id: string) {
  const { rows } = await ex.execute<{ kind: string }>(sql`select kind from sales.document_template where id = ${Number(id)}`);
  return rows[0]?.kind === 'ppf' ? 'PPF voucher format changed' : 'Quotation format changed';
}

/**
 * Saves the notification for one request's changes (inside its transaction) and returns the rows,
 * to be pushed live once committed. Recipients: every active user at the dealership (and the
 * group-wide users), except the person who made the change.
 */
export async function createNotifications(ex: Executor, actorId: number | null, entries: AuditEntry[]): Promise<Row[]> {
  const described = entries.map((entry) => ({ entry, spec: describeChange(entry) })).filter((x): x is { entry: AuditEntry; spec: Spec } => !!x.spec);
  if (!described.length || !actorId) return [];
  const best = described.reduce((a, b) => (b.spec.weight > a.spec.weight ? b : a));
  const same = described.filter((x) => x.entry.entityType === best.entry.entityType && x.entry.action === best.entry.action).length;
  let title = best.spec.title;
  if (best.entry.entityType === 'sales.document_template') title = await templateTitle(ex, String(best.entry.entityId));
  const detail = same > 1 ? `${same} records${best.spec.detail ? ` (first: ${best.spec.detail})` : ''}` : (best.spec.detail ?? null);

  const dealershipId = best.entry.dealershipId ?? entries.find((e) => e.dealershipId)?.dealershipId ?? null;
  // No dealership on the change (e.g. a user account): the dealerships of the person who made it.
  const scope = dealershipId
    ? sql`ur.dealership_id = ${dealershipId}`
    : sql`ur.dealership_id in (select dealership_id from core.user_role where user_id = ${actorId} and dealership_id is not null)`;
  const { rows: recipients } = await ex.execute<{ id: number }>(sql`
    select distinct u.id::int as id
      from core."user" u
      join core.user_role ur on ur.user_id = u.id
     where u.is_active and u.id <> ${actorId} and (ur.dealership_id is null or ${scope})`);
  if (!recipients.length) return [];
  const [actor] = await ex.select({ fullName: user.fullName }).from(user).where(eq(user.id, actorId));

  return ex
    .insert(notification)
    .values(
      recipients.map((r) => ({
        userId: r.id,
        dealershipId,
        entityType: best.entry.entityType,
        entityId: String(best.entry.entityId),
        action: best.entry.action,
        title,
        detail,
        href: best.spec.href ?? null,
        actorId,
        actorName: actor?.fullName ?? null,
      })),
    )
    .returning();
}

/** Pushes saved notifications to their recipients (after commit), with each one's new unread count. */
export function publishNotifications(rows: Row[]) {
  if (!rows.length) return;
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  emitToUsers([...byUser.keys()], 'notification:new', (userId) => ({ notification: present(byUser.get(userId)!) }));
}

export function present(r: Row) {
  return {
    id: r.id,
    title: r.title,
    detail: r.detail,
    href: r.href,
    actorName: r.actorName,
    entityType: r.entityType,
    action: r.action,
    createdAt: r.createdAt.toISOString(),
    readAt: r.readAt ? r.readAt.toISOString() : null,
  };
}

// ---- The signed-in person's notifications (RLS: only their own rows are visible) -------------
const mine = (ctx: EntityCtx) => eq(notification.userId, ctx.access.userId);

export async function listNotifications(ctx: EntityCtx, q: { page: number; pageSize: number; unread?: boolean }) {
  const where = and(mine(ctx), q.unread ? isNull(notification.readAt) : undefined);
  const [{ n: total } = { n: 0 }] = await ctx.tx.select({ n: count() }).from(notification).where(where);
  const rows = await ctx.tx
    .select()
    .from(notification)
    .where(where)
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return { items: rows.map(present), total, page: q.page, pageSize: q.pageSize, unread: await unreadCount(ctx) };
}

export async function unreadCount(ctx: EntityCtx) {
  const [{ n } = { n: 0 }] = await ctx.tx.select({ n: count() }).from(notification).where(and(mine(ctx), isNull(notification.readAt)));
  return n;
}

export async function markRead(ctx: EntityCtx, ids: number[] | 'all') {
  await ctx.tx
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(mine(ctx), isNull(notification.readAt), ids === 'all' ? undefined : inArray(notification.id, ids)));
  return { unread: await unreadCount(ctx) };
}

export async function deleteNotification(ctx: EntityCtx, id: number) {
  const gone = await ctx.tx.delete(notification).where(and(mine(ctx), eq(notification.id, id))).returning({ id: notification.id });
  if (!gone.length) throw notFound('Notification');
  return { unread: await unreadCount(ctx) };
}
