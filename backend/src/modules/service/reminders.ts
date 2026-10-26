/**
 * Services due: the call list for the CRO / Service Advisor / Service Manager. Every car whose next scheduled
 * service (free check-up, free service, paid services) is due soon or overdue, with its owner and phone, and the
 * calls made so far (who called, what the customer said, when to call again).
 */
import { scopeWhere } from '../../auth/access';
import { query } from '../../db/client';
import { type SQL, and, eq, inArray, sql } from '../../db/sql';
import type { EntityCtx } from '../../entity/types';
import { forbidden, notFound, validationError } from '../../lib/errors';
import { addDays, pakistanToday } from '../../lib/dates';
import type { z } from '../../lib/zod';
import { dealership } from '../core/models';
import { customer, vehicle, vehicleModel, vehicleOwnership } from '../master/models';
import { ServicePerm as P } from './permissions';
import type { ReminderCallBody, ServicesDueQuery } from './schemas';
import { reminderCall, vehicleSchedule } from './models';

export const CALL_OUTCOMES = ['booked', 'will_come', 'call_later', 'no_answer', 'wrong_number', 'not_interested', 'already_serviced'] as const;

export async function servicesDue(ctx: EntityCtx, q: z.output<typeof ServicesDueQuery>) {
  const conds: SQL[] = [
    sql`${vehicleSchedule.status} = 'due'`,
    sql`${vehicleOwnership.endDate} is null`,
    scopeWhere(ctx.access.scope(P.remindersView), { dealership: vehicleOwnership.dealershipId }),
    sql`${vehicleSchedule.dueDate} <= ${addDays(pakistanToday(), q.days)}::date`,
  ];
  if (q.dealershipId) conds.push(eq(vehicleOwnership.dealershipId, q.dealershipId));
  if (q.overdueOnly) conds.push(sql`${vehicleSchedule.dueDate} < ${pakistanToday()}::date`);
  // A car already in the workshop for this service does not need a call.
  conds.push(sql`not exists (select 1 from service.visit x where x.vehicle_id = ${vehicle.id} and x.status in ('open', 'in_progress', 'ready'))`);
  const where = and(...conds)!;
  const rows = await query<{
    scheduleId: number; service: string; dueDate: string; dueKm: number; isFree: boolean;
    vehicleId: number; registrationNo: string | null; vin: string | null; modelName: string | null; lastOdometerKm: number | null;
    customerId: number; customerName: string; mobile: string; dealershipId: number; dealershipName: string;
  }>(
    ctx.tx,
    sql`select ${vehicleSchedule.id} as "scheduleId", ${vehicleSchedule.name} as "service", ${vehicleSchedule.dueDate}::text as "dueDate",
               ${vehicleSchedule.dueKm} as "dueKm", ${vehicleSchedule.isFree} as "isFree",
               ${vehicle.id} as "vehicleId", ${vehicle.registrationNo} as "registrationNo", ${vehicle.vin} as "vin",
               ${vehicleModel.name} as "modelName", ${vehicle.lastOdometerKm} as "lastOdometerKm",
               ${customer.id} as "customerId", ${customer.fullName} as "customerName", ${customer.mobile} as "mobile",
               ${dealership.id} as "dealershipId", ${dealership.name} as "dealershipName"
          from ${vehicleSchedule}
          inner join ${vehicle} on ${vehicle.id} = ${vehicleSchedule.vehicleId}
          inner join ${vehicleOwnership} on ${vehicleOwnership.vehicleId} = ${vehicle.id}
          inner join ${customer} on ${customer.id} = ${vehicleOwnership.customerId}
          inner join ${dealership} on ${dealership.id} = ${vehicleOwnership.dealershipId}
          left join ${vehicleModel} on ${vehicleModel.id} = ${vehicle.modelId}
         where ${where}
         order by ${vehicleSchedule.dueDate} asc, ${vehicleSchedule.id} asc
         limit 500`,
  );
  const ids = rows.map((r) => r.scheduleId);
  const calls = ids.length
    ? await query<{ scheduleId: number; outcome: string; remarks: string | null; nextCallOn: string | null; at: Date; by: string | null; n: number }>(
        ctx.tx,
        sql`select distinct on (${reminderCall.scheduleId}) ${reminderCall.scheduleId} as "scheduleId", ${reminderCall.outcome} as "outcome",
                   ${reminderCall.remarks} as "remarks", ${reminderCall.nextCallOn}::text as "nextCallOn", ${reminderCall.createdAt} as "at",
                   (select u.full_name from core."user" u where u.id = ${reminderCall.createdById}) as "by",
                   (select count(*)::int from ${reminderCall} rc where rc.schedule_id = ${reminderCall.scheduleId}) as "n"
              from ${reminderCall}
             where ${inArray(reminderCall.scheduleId, ids)}
             order by ${reminderCall.scheduleId}, ${reminderCall.createdAt} desc, ${reminderCall.id} desc`,
      )
    : [];
  const last = new Map(calls.map((c) => [c.scheduleId, c]));
  const today = pakistanToday();
  const items = rows.map((r) => {
    const c = last.get(r.scheduleId);
    return {
      ...r,
      overdue: r.dueDate < today,
      callCount: c?.n ?? 0,
      lastCall: c ? { outcome: c.outcome, remarks: c.remarks, nextCallOn: c.nextCallOn, at: c.at, by: c.by } : null,
    };
  });
  const filtered = q.uncalledOnly ? items.filter((i) => !i.lastCall) : items;
  return { items: filtered, total: filtered.length, overdue: filtered.filter((i) => i.overdue).length };
}

/** A call to the customer about a due service: what they said, and when to call again / the appointment day. */
export async function recordReminderCall(ctx: EntityCtx, input: z.output<typeof ReminderCallBody>) {
  const [s] = await query<{ vehicleId: number; dealershipId: number }>(
    ctx.tx,
    sql`select ${vehicleSchedule.vehicleId} as "vehicleId", ${vehicleOwnership.dealershipId} as "dealershipId"
          from ${vehicleSchedule}
          inner join ${vehicleOwnership} on ${vehicleOwnership.vehicleId} = ${vehicleSchedule.vehicleId} and ${vehicleOwnership.endDate} is null
         where ${vehicleSchedule.id} = ${input.scheduleId}
         limit 1`,
  );
  if (!s) throw notFound('Service due');
  if (!ctx.access.canIn(P.remindersUpdate, { dealershipId: s.dealershipId })) throw forbidden();
  if (input.nextCallOn && input.nextCallOn < pakistanToday()) throw validationError([{ in: 'body', path: 'nextCallOn', message: 'Choose today or a later day' }]);
  if (['booked', 'will_come', 'call_later'].includes(input.outcome) && !input.nextCallOn) {
    throw validationError([{ in: 'body', path: 'nextCallOn', message: input.outcome === 'call_later' ? 'Choose the day to call again' : 'Choose the day the customer will come' }]);
  }
  const row = await ctx.tx.reminderCall.create({
    data: {
      dealershipId: s.dealershipId,
      scheduleId: input.scheduleId,
      vehicleId: s.vehicleId,
      outcome: input.outcome,
      remarks: input.remarks?.trim() || null,
      nextCallOn: input.nextCallOn ?? null,
      createdById: ctx.access.userId,
    },
    select: { id: true },
  });
  await ctx.audit({ entityType: 'service.reminder_call', entityId: row.id, action: 'create', dealershipId: s.dealershipId, branchId: null, changes: { scheduleId: input.scheduleId, outcome: input.outcome, nextCallOn: input.nextCallOn ?? null } });
  return { id: row.id };
}

/** Every call made about one due service, newest first. */
export async function reminderCalls(ctx: EntityCtx, scheduleId: number) {
  return query<{ id: number; outcome: string; remarks: string | null; nextCallOn: string | null; at: Date; by: string | null }>(
    ctx.tx,
    sql`select ${reminderCall.id} as "id", ${reminderCall.outcome} as "outcome", ${reminderCall.remarks} as "remarks",
               ${reminderCall.nextCallOn}::text as "nextCallOn", ${reminderCall.createdAt} as "at",
               (select u.full_name from core."user" u where u.id = ${reminderCall.createdById}) as "by"
          from ${reminderCall}
         where ${and(eq(reminderCall.scheduleId, scheduleId), scopeWhere(ctx.access.scope(P.remindersView), { dealership: reminderCall.dealershipId }))!}
         order by ${reminderCall.createdAt} desc, ${reminderCall.id} desc
         limit 50`,
  );
}
