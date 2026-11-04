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
import type { AppointmentsQuery, ReminderCallBody, ServicesDueQuery } from './schemas';
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
  // A customer who came on their own for a later service (the odometer picked it) needs no call for the earlier ones.
  conds.push(sql`not exists (select 1 from ${vehicleSchedule} d where d.vehicle_id = ${vehicle.id} and d.status = 'done' and d.sequence > ${vehicleSchedule.sequence})`);
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
    ? await query<{ scheduleId: number; outcome: string; remarks: string | null; nextCallOn: string | null; appointmentTime: string | null; at: Date; by: string | null; n: number }>(
        ctx.tx,
        sql`select distinct on (${reminderCall.scheduleId}) ${reminderCall.scheduleId} as "scheduleId", ${reminderCall.outcome} as "outcome",
                   ${reminderCall.remarks} as "remarks", ${reminderCall.nextCallOn}::text as "nextCallOn", ${reminderCall.appointmentTime} as "appointmentTime", ${reminderCall.createdAt} as "at",
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
      lastCall: c ? { outcome: c.outcome, remarks: c.remarks, nextCallOn: c.nextCallOn, appointmentTime: c.appointmentTime, at: c.at, by: c.by } : null,
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
      appointmentTime: input.outcome === 'booked' ? (input.appointmentTime ?? null) : null,
      createdById: ctx.access.userId,
    },
    select: { id: true },
  });
  await ctx.audit({ entityType: 'service.reminder_call', entityId: row.id, action: 'create', dealershipId: s.dealershipId, branchId: null, changes: { scheduleId: input.scheduleId, outcome: input.outcome, nextCallOn: input.nextCallOn ?? null } });
  return { id: row.id };
}

/** Every call made about one due service, newest first. */
export async function reminderCalls(ctx: EntityCtx, scheduleId: number) {
  return query<{ id: number; outcome: string; remarks: string | null; nextCallOn: string | null; appointmentTime: string | null; at: Date; by: string | null }>(
    ctx.tx,
    sql`select ${reminderCall.id} as "id", ${reminderCall.outcome} as "outcome", ${reminderCall.remarks} as "remarks",
               ${reminderCall.nextCallOn}::text as "nextCallOn", ${reminderCall.appointmentTime} as "appointmentTime", ${reminderCall.createdAt} as "at",
               (select u.full_name from core."user" u where u.id = ${reminderCall.createdById}) as "by"
          from ${reminderCall}
         where ${and(eq(reminderCall.scheduleId, scheduleId), scopeWhere(ctx.access.scope(P.remindersView), { dealership: reminderCall.dealershipId }))!}
         order by ${reminderCall.createdAt} desc, ${reminderCall.id} desc
         limit 50`,
  );
}

/**
 * The appointments the CRO booked (outcome "booked" on the latest call about a service that is still due), by day: what the
 * service advisors prepare for. Today to a month ahead unless the dates are given.
 */
export async function appointments(ctx: EntityCtx, q: z.output<typeof AppointmentsQuery>) {
  const today = pakistanToday();
  const from = q.from ?? today;
  const to = q.to ?? addDays(today, 30);
  const conds: SQL[] = [
    sql`last."outcome" = 'booked'`,
    sql`last."date" between ${from}::date and ${to}::date`,
    sql`${vehicleSchedule.status} = 'due'`,
    sql`${vehicleOwnership.endDate} is null`,
    scopeWhere(ctx.access.scope(P.remindersView), { dealership: vehicleOwnership.dealershipId }),
  ];
  if (q.dealershipId) conds.push(eq(vehicleOwnership.dealershipId, q.dealershipId));
  return query<{
    scheduleId: number; date: string; time: string | null; service: string; dueKm: number; remarks: string | null; bookedBy: string | null; bookedAt: Date;
    vehicleId: number; registrationNo: string | null; modelName: string | null; customerId: number; customerName: string; mobile: string; dealershipId: number; dealershipName: string;
  }>(
    ctx.tx,
    sql`select last."scheduleId" as "scheduleId", last."date"::text as "date", last."time" as "time", ${vehicleSchedule.name} as "service", ${vehicleSchedule.dueKm} as "dueKm",
               last."remarks" as "remarks", last."bookedBy" as "bookedBy", last."bookedAt" as "bookedAt",
               ${vehicle.id} as "vehicleId", ${vehicle.registrationNo} as "registrationNo", ${vehicleModel.name} as "modelName",
               ${customer.id} as "customerId", ${customer.fullName} as "customerName", ${customer.mobile} as "mobile",
               ${dealership.id} as "dealershipId", ${dealership.name} as "dealershipName"
          from (
            select distinct on (${reminderCall.scheduleId}) ${reminderCall.scheduleId} as "scheduleId", ${reminderCall.outcome} as "outcome", ${reminderCall.nextCallOn} as "date",
                   ${reminderCall.appointmentTime} as "time", ${reminderCall.remarks} as "remarks", ${reminderCall.createdAt} as "bookedAt",
                   (select u.full_name from core."user" u where u.id = ${reminderCall.createdById}) as "bookedBy"
              from ${reminderCall}
             order by ${reminderCall.scheduleId}, ${reminderCall.createdAt} desc, ${reminderCall.id} desc
          ) last
          inner join ${vehicleSchedule} on ${vehicleSchedule.id} = last."scheduleId"
          inner join ${vehicle} on ${vehicle.id} = ${vehicleSchedule.vehicleId}
          inner join ${vehicleOwnership} on ${vehicleOwnership.vehicleId} = ${vehicle.id}
          inner join ${customer} on ${customer.id} = ${vehicleOwnership.customerId}
          inner join ${dealership} on ${dealership.id} = ${vehicleOwnership.dealershipId}
          left join ${vehicleModel} on ${vehicleModel.id} = ${vehicle.modelId}
         where ${and(...conds)!}
         order by last."date" asc, last."time" asc nulls last, ${vehicleSchedule.id} asc
         limit 500`,
  );
}
