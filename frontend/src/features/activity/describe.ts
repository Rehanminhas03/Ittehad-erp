import { humanize } from '@/shared/lib';

/** An activity entry as returned by /api/core/activity (the fields this module reads). */
export interface ActivityLike {
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: string;
  changes?: unknown;
}

export type ActivityKind = 'sign_in' | 'sign_in_problem' | 'lead' | 'document' | 'order' | 'delivery' | 'stock' | 'user' | 'other';

export interface Described {
  /** One readable sentence, e.g. "Recorded a follow-up on Ayesha Khan". */
  title: string;
  /** Extra detail (remarks, new status, role name …). */
  detail?: string;
  kind: ActivityKind;
  /** Where to open the record, if it has a screen. */
  href?: string;
}

const LEAD_STEPS: Record<string, string> = {
  follow_up: 'Moved {x} to Follow-up',
  visit: 'Marked {x} as visited',
  convert: 'Converted {x}',
  raise_order: 'Sales order raised for {x}',
  complete: 'Lead {x} completed (vehicle delivered)',
  exhaust: 'Marked {x} as exhausted',
  reopen: 'Reopened {x}',
  order_cancelled: 'Order cancelled; {x} back to Converted',
};
const ORDER_STEPS: Record<string, string> = {
  submit: 'Submitted sales order {x} for approval',
  approve: 'Approved sales order {x}',
  return: 'Returned sales order {x} to draft',
  cancel: 'Cancelled sales order {x}',
  deliver: 'Sales order {x} delivered',
};
const DELIVERY_STEPS: Record<string, string> = {
  complete: 'Completed delivery {x}',
  cancel: 'Cancelled delivery {x}',
};
const OUTCOMES: Record<string, string> = { interested: 'Interested', not_interested: 'Not interested', visited: 'Visited in person' };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const fill = (template: string, label: string) => template.replace('{x}', label);

/** Turns a raw audit entry into a sentence a salesperson or manager understands. */
export function describeActivity(e: ActivityLike): Described {
  const c = obj(e.changes);
  const [, entityName = e.entityType] = e.entityType.split('.');
  const step = e.action.startsWith('transition:') ? e.action.slice('transition:'.length) : null;

  if (e.entityType === 'core.user') {
    const who = e.entityLabel ?? 'a user';
    const href = `/admin/users/${e.entityId}`;
    switch (e.action) {
      case 'login':
        return { title: 'Signed in', kind: 'sign_in' };
      case 'login.dev':
        return { title: 'Signed in (development)', kind: 'sign_in' };
      case 'logout':
        return { title: 'Signed out', kind: 'sign_in' };
      case 'login.failed':
        return { title: 'Failed sign-in attempt', detail: 'Wrong email or password', kind: 'sign_in_problem' };
      case 'login.blocked':
        return { title: 'Sign-in blocked', detail: 'The account is deactivated', kind: 'sign_in_problem' };
      case 'password.change':
        return { title: 'Changed their password', kind: 'sign_in' };
      case 'profile.update':
        return { title: 'Updated their profile', kind: 'user' };
      case 'create':
        return { title: `Created the account of ${who}`, kind: 'user', href };
      case 'role.assign':
        return { title: `Gave ${who} a role`, detail: typeof c.roleName === 'string' ? c.roleName : undefined, kind: 'user', href };
      case 'role.revoke':
        return { title: `Removed a role from ${who}`, kind: 'user', href };
      case 'update': {
        const active = obj(c.isActive);
        if ('to' in active) return { title: active.to ? `Reactivated ${who}` : `Deactivated ${who}`, kind: 'user', href };
        if (c.password) return { title: `Reset the password of ${who}`, kind: 'user', href };
        return { title: `Updated the details of ${who}`, kind: 'user', href };
      }
    }
  }

  if (e.entityType === 'sales.lead') {
    const x = e.entityLabel ?? 'a lead';
    const href = `/sales/leads/${e.entityId}`;
    if (e.action === 'create') return { title: `Logged lead ${x}`, kind: 'lead', href };
    if (e.action === 'update') return { title: `Edited lead ${x}`, kind: 'lead', href };
    if (e.action === 'follow_up') {
      const detail = [OUTCOMES[String(c.outcome)] ?? undefined, typeof c.remarks === 'string' && c.remarks ? `“${c.remarks}”` : undefined].filter(Boolean).join(' · ');
      return { title: `Recorded a follow-up on ${x}`, detail: detail || undefined, kind: 'lead', href };
    }
    if (e.action === 'quotation.issue') {
      const detail = [typeof c.quotationNo === 'string' ? c.quotationNo : undefined, typeof c.model === 'string' ? c.model : undefined, c.total ? `PKR ${Number(c.total).toLocaleString('en-PK')}` : undefined].filter(Boolean).join(' · ');
      return { title: `Issued a vehicle quotation to ${x}`, detail: detail || undefined, kind: 'lead', href };
    }
    if (e.action === 'details.update') return { title: `Corrected the details of ${x}`, kind: 'lead', href };
    if (e.action === 'reassign') {
      const detail = [typeof c.fromName === 'string' && typeof c.toName === 'string' ? `${c.fromName} → ${c.toName}` : undefined, typeof c.note === 'string' && c.note ? `“${c.note}”` : undefined].filter(Boolean).join(' · ');
      return { title: `Reassigned lead ${x}`, detail: detail || undefined, kind: 'lead', href };
    }
    if (e.action === 'appointment') {
      const when = typeof c.appointmentAt === 'string' ? new Date(c.appointmentAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : undefined;
      return { title: `Set an appointment with ${x}`, detail: [when, typeof c.note === 'string' && c.note ? `“${c.note}”` : undefined].filter(Boolean).join(' · ') || undefined, kind: 'lead', href };
    }
    if (e.action === 'appointment.cancel') return { title: `Cancelled the appointment with ${x}`, kind: 'lead', href };
    if (e.action === 'hand_over') return { title: `Handed over lead ${x}`, detail: typeof c.toName === 'string' ? `to ${c.toName}` : undefined, kind: 'lead', href };
    if (e.action === 'escalate') return { title: `Sent duplicate customer ${x} to the Assistant Manager`, detail: typeof c.note === 'string' ? c.note : undefined, kind: 'lead', href };
    if (step && LEAD_STEPS[step]) return { title: fill(LEAD_STEPS[step]!, x), kind: 'lead', href };
  }

  if (e.entityType === 'sales.vehicle_variant') {
    const x = e.entityLabel ?? 'a variant code';
    const d = obj(c.description);
    const detail = typeof c.description === 'string' ? c.description : typeof d.to === 'string' ? d.to : undefined;
    return { title: e.action === 'create' ? `Added variant code ${x}` : `Changed variant code ${x}`, detail, kind: 'document', href: `/sales/variants/${e.entityId}` };
  }

  if (e.entityType === 'sales.document_template') {
    const fields = Object.keys(c).map((k) => humanize(k).toLowerCase());
    return { title: `Changed the ${(e.entityLabel ?? 'quotation format').toLowerCase()}`, detail: fields.join(', ') || undefined, kind: 'document', href: '/sales/document-formats' };
  }

  if (e.entityType === 'sales.quotation' || e.entityType === 'sales.ppf_form') {
    const isQt = e.entityType === 'sales.quotation';
    const x = e.entityLabel ?? (isQt ? 'a quotation' : 'a PPF voucher');
    const href = `/sales/${isQt ? 'quotations' : 'ppf-forms'}/${e.entityId}`;
    // Created: the amount; corrected: { from, to }.
    const total = c.totalAmount && typeof c.totalAmount === 'object' ? obj(c.totalAmount).to : c.totalAmount;
    const amount = typeof total === 'string' || typeof total === 'number' ? `PKR ${Number(total).toLocaleString('en-PK')}` : undefined;
    if (e.action === 'create') return { title: isQt ? `Issued vehicle quotation ${x}` : `Sold PPF — voucher ${x}`, detail: amount, kind: 'document', href };
    if (e.action === 'update') {
      const fields = Object.keys(c).filter((k) => k !== 'totalAmount').map((k) => humanize(k).toLowerCase());
      return { title: `Corrected ${isQt ? 'quotation' : 'PPF voucher'} ${x}`, detail: [fields.join(', '), amount && `now ${amount}`].filter(Boolean).join(' · ') || undefined, kind: 'document', href };
    }
  }

  if (e.entityType === 'sales.order') {
    const x = e.entityLabel ?? 'a sales order';
    const href = `/sales/orders/${e.entityId}`;
    if (e.action === 'create') return { title: `Raised sales order ${x}`, kind: 'order', href };
    if (e.action === 'update') return { title: `Edited sales order ${x}`, kind: 'order', href };
    if (e.action === 'vehicle.set') {
      const detail = [c.vin && `Chassis ${String(c.vin)}`, c.engineNo && `Engine ${String(c.engineNo)}`].filter(Boolean).join(' · ');
      return { title: `Entered the vehicle for ${x}`, detail: detail || undefined, kind: 'order', href };
    }
    if (e.action === 'allocate') return { title: `Allocated a stock vehicle to ${x}`, kind: 'order', href };
    if (e.action === 'release') return { title: `Released the vehicle from ${x}`, kind: 'order', href };
    if (step && ORDER_STEPS[step]) return { title: fill(ORDER_STEPS[step]!, x), kind: 'order', href };
  }

  if (e.entityType === 'sales.delivery') {
    const x = e.entityLabel ?? 'a delivery';
    const href = `/sales/deliveries/${e.entityId}`;
    if (e.action === 'create') return { title: `Scheduled delivery ${x}`, kind: 'delivery', href };
    if (step && DELIVERY_STEPS[step]) return { title: fill(DELIVERY_STEPS[step]!, x), kind: 'delivery', href };
  }

  if (e.entityType === 'sales.stock_vehicle' || e.entityType === 'master.vehicle') {
    const x = e.entityLabel ?? 'a vehicle';
    const href = `/sales/stock/${e.entityId}`;
    if (e.action === 'create') return { title: `Registered stock vehicle ${x}`, kind: 'stock', href };
    if (e.action === 'update') return { title: `Edited stock vehicle ${x}`, kind: 'stock', href };
    if (e.action === 'status.update') return { title: `Moved vehicle ${x} to ${humanize(String(c.status ?? ''))}`, kind: 'stock', href };
  }

  // Anything else: a plain but readable fallback.
  const verb = humanize(step ?? e.action);
  return { title: `${verb} ${humanize(entityName).toLowerCase()}${e.entityLabel ? ` ${e.entityLabel}` : ''}`, kind: 'other' };
}
