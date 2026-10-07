/**
 * Notifications: every change a person makes (a new lead, a quotation, a car added to stock, an
 * approval request, a delivery, a new user…) becomes a notification for the others at that dealership
 * whose portal it belongs to (see audienceOf), e.g. "New lead added — by Sales 1".
 *
 * Built from the audit entries of one request (the same ones behind the Activity log), in the same
 * transaction, then pushed live over the socket once the change is saved (apiRouter). One request
 * gives one notification: the most meaningful of its entries (e.g. "Car delivered", not the
 * bookkeeping around it); many of the same kind collapse ("Variant codes added (19)").
 * Sign-ins and personal profile changes are not broadcast. Details never carry customer data.
 */
import { type Executor, type Tx, query } from '../../db/client';
import { sql } from '../../db/sql';
import type { EntityCtx } from '../../entity/types';
import { notFound } from '../../lib/errors';
import { emitToUsers } from '../../lib/realtime';
import type { AuditEntry } from './audit';

type Row = NonNullable<Awaited<ReturnType<Tx['notification']['findFirst']>>>;
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
  mark_lost: ['Lead lost: customer not interested', 60],
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
      if (e.action === 'follow_up.comment') return { title: 'New comment on a follow-up', weight: 65, href };
      if (e.action === 'details.update') return { title: 'Customer details corrected', weight: 40, href };
      if (e.action === 'escalate') return { title: 'Duplicate customer sent to the Assistant Manager', weight: 65, href };
      if (e.action === 'appointment') {
        const at = typeof c.appointmentAt === 'string' ? new Date(c.appointmentAt) : null;
        const when = at ? at.toLocaleString('en-PK', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : undefined;
        return { title: 'Appointment set with a customer', weight: 55, href, detail: [when, str(c.note)].filter(Boolean).join(' · ') || undefined };
      }
      if (e.action === 'appointment.cancel') return { title: 'Appointment cancelled', weight: 40, href };
      if (e.action === 'reassign') return { title: 'Lead reassigned', weight: 60, href, detail: str(c.toName) ? `to ${str(c.toName)}` : undefined };
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
    case 'sales.leave':
      if (e.action === 'create') return { title: 'Leave application submitted: please approve or reject', weight: 70, href: `/sales/leave/${id}`, detail: str(c.applicationNo) };
      if (e.action === 'approve') return { title: 'Leave application approved', weight: 70, href: `/sales/leave/${id}`, detail: str(c.applicationNo) };
      if (e.action === 'reject') return { title: 'Leave application rejected', weight: 70, href: `/sales/leave/${id}`, detail: str(c.note) };
      break;
    case 'sales.order': {
      const href = `/sales/orders/${id}`;
      if (e.action === 'create') return { title: 'Sales order raised', weight: 70, href, detail: str(c.orderNo) };
      if (e.action === 'update') return { title: 'Sales order updated', weight: 30, href };
      if (e.action === 'vehicle.set') return { title: 'Car entered on a sales order', weight: 50, href, detail: str(c.vin) };
      if (e.action === 'allocate') return { title: 'Car allocated to a sales order', weight: 55, href };
      if (e.action === 'release') return { title: 'Car released back to stock', weight: 50, href };
      if (e.action === 'payment.add') return { title: 'Payment received on a sales order', weight: 45, href, detail: str(c.amount) ? `Rs ${str(c.amount)}` : undefined };
      if (e.action === 'payment.remove') return { title: 'Payment removed from a sales order', weight: 40, href };
      if (e.action === 'clearance.request') return { title: 'Delivery clearance requested: check the payments', weight: 75, href, detail: str(c.note) };
      if (e.action === 'clearance.approve') return { title: 'Car cleared for delivery', weight: 75, href };
      if (e.action === 'clearance.reject') return { title: 'Delivery clearance rejected', weight: 75, href, detail: str(c.note) };
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
    case 'master.vehicle_model':
      if (e.action === 'create') return { title: 'New model added', weight: 60, href: '/sales/variants', detail: str(c.name) };
      if (e.action === 'update') return { title: 'Model changed', weight: 45, href: '/sales/variants' };
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
  const rows = await query<{ kind: string }>(ex, sql`select kind from sales.document_template where id = ${Number(id)}`);
  return rows[0]?.kind === 'ppf' ? 'PPF voucher format changed' : 'Quotation format changed';
}

/**
 * Who a change concerns: holders of `codes` (they see every such record), plus the record's own
 * person (`ownerId`, e.g. the lead's salesperson) through `ownerCodes`. Each code counts only where
 * it is held (that dealership, or group-wide). null: everyone at the dealership (other modules).
 */
interface Audience {
  codes: string[];
  ownerCodes?: string[];
  ownerId?: number | null;
  /** Where the notification leads when that differs (a car on an order: the order). */
  href?: string;
  /** Where it leads for the owner who reaches it only as the owner (a salesperson: their lead). */
  ownerHref?: string;
}

/** The order's salesperson follows it on their lead (salespeople have no order screens). */
const SALESPERSON = ['sales.orders.view_own', 'sales.leads.view_own'];
const leadHref = (leadId: number | null | undefined) => (leadId ? `/sales/leads/${leadId}` : undefined);

const CONVERTED_LEAD = ['converted', 'processing', 'completed'];

async function audienceOf(ex: Executor, e: AuditEntry): Promise<Audience | null> {
  const id = Number(e.entityId);
  const one = async <T>(q: ReturnType<typeof sql>) => (await query<T>(ex, q))[0];
  switch (e.entityType) {
    case 'sales.lead': {
      const l = await one<{ ownerId: number | null; status: string }>(sql`select owner_id as "ownerId", status from sales.lead where id = ${id}`);
      const codes = ['sales.leads.view_all', ...(l && CONVERTED_LEAD.includes(l.status) ? ['sales.leads.view_converted'] : [])];
      return { codes, ownerCodes: ['sales.leads.view_own'], ownerId: l?.ownerId };
    }
    case 'sales.order': {
      const o = await one<{ ownerId: number | null; leadId: number | null }>(sql`select salesperson_id as "ownerId", lead_id as "leadId" from sales.sales_order where id = ${id}`);
      return { codes: ['sales.orders.view_all'], ownerCodes: SALESPERSON, ownerId: o?.ownerId, ownerHref: leadHref(o?.leadId) };
    }
    case 'sales.delivery': {
      const d = await one<{ ownerId: number | null; leadId: number | null }>(
        sql`select d.salesperson_id as "ownerId", o.lead_id as "leadId" from sales.delivery d join sales.sales_order o on o.id = d.sales_order_id where d.id = ${id}`,
      );
      return { codes: ['sales.deliveries.view_all'], ownerCodes: ['sales.deliveries.view_own', ...SALESPERSON], ownerId: d?.ownerId, ownerHref: leadHref(d?.leadId) };
    }
    case 'master.vehicle': {
      // A car's stage: for the people of the order holding it (and whoever sees the open stock).
      const o = await one<{ id: number; ownerId: number | null; leadId: number | null }>(
        sql`select id, salesperson_id as "ownerId", lead_id as "leadId" from sales.sales_order where vehicle_id = ${id} and status <> 'cancelled' order by id desc limit 1`,
      );
      return o
        ? { codes: ['sales.orders.view_all', 'sales.stock.view'], ownerCodes: SALESPERSON, ownerId: o.ownerId, href: `/sales/orders/${o.id}`, ownerHref: leadHref(o.leadId) }
        : { codes: ['sales.stock.view'] };
    }
    case 'sales.stock_vehicle':
      return { codes: ['sales.stock.view'] };
    // Leave: the approvers (Assistant Manager / Manager) and the employee who applied.
    case 'sales.leave': {
      const l = await one<{ ownerId: number | null }>(sql`select employee_id as "ownerId" from sales.leave_application where id = ${id}`);
      return { codes: ['sales.leave.approve'], ownerCodes: ['sales.leave.apply'], ownerId: l?.ownerId };
    }
    case 'sales.quotation': {
      const q = await one<{ ownerId: number | null }>(sql`select owner_id as "ownerId" from sales.quotation where id = ${id}`);
      return { codes: ['sales.quotations.view_all'], ownerCodes: ['sales.quotations.view_own'], ownerId: q?.ownerId };
    }
    case 'sales.ppf_form': {
      const p = await one<{ ownerId: number | null }>(sql`select owner_id as "ownerId" from sales.ppf_form where id = ${id}`);
      return { codes: ['sales.ppf.view_all'], ownerCodes: ['sales.ppf.view_own'], ownerId: p?.ownerId };
    }
    case 'sales.vehicle_variant':
    case 'sales.document_template':
    case 'master.vehicle_model':
      return { codes: ['sales.templates.manage'] };
    case 'core.user':
      return { codes: ['core.users.view'] };
    case 'master.customer':
      return { codes: ['master.customers.view'] };
    default:
      return null;
  }
}

/**
 * Saves the notification for one request's changes (inside its transaction) and returns the rows,
 * to be pushed live once committed. Recipients: the active users at the dealership (and the
 * group-wide users) whose portal the change belongs to (audienceOf: e.g. a lead reaches whoever
 * sees all leads and its own salesperson, not the Delivery Team), except the person who made it.
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
  const audience = await audienceOf(ex, best.entry);
  // A permission counts only where it is held (the same role assignment as the scope). seesAll: through
  // `codes` (not only as the record's owner).
  const recipients = audience
    ? await query<{ id: number; seesAll: boolean }>(ex, sql`
        select u.id::int as id, bool_or(p.code = any(${audience.codes})) as "seesAll"
          from core."user" u
          join core.user_role ur on ur.user_id = u.id
          join core.role_permission rp on rp.role_id = ur.role_id
          join core.permission p on p.id = rp.permission_id
         where u.is_active and u.id <> ${actorId} and (ur.dealership_id is null or ${scope})
         group by u.id
        having bool_or(p.code = any(${audience.codes}) or (u.id = ${audience.ownerId ?? 0} and p.code = any(${audience.ownerCodes ?? []})))`)
    : await query<{ id: number; seesAll: boolean }>(ex, sql`
        select distinct u.id::int as id, true as "seesAll"
          from core."user" u
          join core.user_role ur on ur.user_id = u.id
         where u.is_active and u.id <> ${actorId} and (ur.dealership_id is null or ${scope})`);
  if (!recipients.length) return [];
  const href = audience?.href ?? best.spec.href ?? null;
  const actor = await ex.user.findFirst({ where: { id: actorId }, select: { fullName: true } });

  return ex.notification.createManyAndReturn({
    data: recipients.map((r) => ({
      userId: r.id,
      dealershipId,
      entityType: best.entry.entityType,
      entityId: String(best.entry.entityId),
      action: best.entry.action,
      title,
      detail,
      href: r.seesAll ? href : (audience?.ownerHref ?? href),
      actorId,
      actorName: actor?.fullName ?? null,
    })),
  });
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
const mine = (ctx: EntityCtx) => ({ userId: ctx.access.userId });

export async function listNotifications(ctx: EntityCtx, q: { page: number; pageSize: number; unread?: boolean }) {
  const where = { ...mine(ctx), ...(q.unread ? { readAt: null } : {}) };
  const total = await ctx.tx.notification.count({ where });
  const rows = await ctx.tx.notification.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.pageSize,
    skip: (q.page - 1) * q.pageSize,
  });
  return { items: rows.map(present), total, page: q.page, pageSize: q.pageSize, unread: await unreadCount(ctx) };
}

export async function unreadCount(ctx: EntityCtx) {
  return ctx.tx.notification.count({ where: { ...mine(ctx), readAt: null } });
}

export async function markRead(ctx: EntityCtx, ids: number[] | 'all') {
  await ctx.tx.notification.updateMany({
    where: { ...mine(ctx), readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return { unread: await unreadCount(ctx) };
}

export async function deleteNotification(ctx: EntityCtx, id: number) {
  const gone = await ctx.tx.notification.deleteMany({ where: { ...mine(ctx), id } });
  if (!gone.count) throw notFound('Notification');
  return { unread: await unreadCount(ctx) };
}
