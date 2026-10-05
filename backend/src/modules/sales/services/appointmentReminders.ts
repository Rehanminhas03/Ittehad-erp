/**
 * "Appointment today" reminders. Every few minutes the server looks for leads with an appointment
 * today (Pakistan time) not yet reminded, and notifies everyone who follows the lead: its
 * salesperson and whoever sees all the dealership's leads (Assistant Manager, Manager). Each
 * appointment is reminded once (lead.appointment_reminded_at); moving it reminds again on its day.
 */
import { applyTenant, db, query, transaction } from '../../../db/client';
import { sql } from '../../../db/sql';
import { logger } from '../../../lib/logger';
import { publishNotifications } from '../../core/notifications';
import { SalesPerm as P } from '../permissions';

type Due = { id: number; dealershipId: number; ownerId: number; actorId: number; at: Date; note: string | null; actorName: string | null };

const timeOf = (d: Date) => d.toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit', hour12: true });

/** Sends today's reminders (not yet sent); returns how many leads were reminded. */
export async function sendAppointmentReminders(): Promise<number> {
  const published: Parameters<typeof publishNotifications>[0] = [];
  const reminded = await transaction(db, async (tx) => {
    // A system job: sees every dealership.
    await applyTenant(tx, { userId: 0, dealershipIds: 'all' });
    const due = await query<Due>(
      tx,
      sql`select l.id::int as id, l.dealership_id::int as "dealershipId", l.owner_id::int as "ownerId",
                 coalesce(l.appointment_set_by_id, l.owner_id)::int as "actorId",
                 l.appointment_at as at, l.appointment_note as note, u.full_name as "actorName"
            from sales.lead l
            left join core."user" u on u.id = coalesce(l.appointment_set_by_id, l.owner_id)
           where l.appointment_at is not null and l.appointment_reminded_at is null
             and (l.appointment_at at time zone 'Asia/Karachi')::date = (now() at time zone 'Asia/Karachi')::date
             and l.status not in ('completed', 'exhausted')
           order by l.appointment_at
           limit 200
             for update of l skip locked`,
    );
    for (const l of due) {
      const recipients = await query<{ id: number }>(
        tx,
        sql`select distinct u.id::int as id
              from core."user" u
              join core.user_role ur on ur.user_id = u.id
              join core.role_permission rp on rp.role_id = ur.role_id
              join core.permission p on p.id = rp.permission_id
             where u.is_active and (ur.dealership_id is null or ur.dealership_id = ${l.dealershipId})
               and (p.code = ${P.leadsViewAll} or (u.id = ${l.ownerId} and p.code = ${P.leadsViewOwn}))`,
      );
      // The notification's actor is whoever set the appointment (the rows are readable back as theirs).
      await tx.$queryRaw`select set_config('app.user_id', ${String(l.actorId)}, true)`;
      if (recipients.length) {
        published.push(
          ...(await tx.notification.createManyAndReturn({
            data: recipients.map((r) => ({
              userId: r.id,
              dealershipId: l.dealershipId,
              entityType: 'sales.lead',
              entityId: String(l.id),
              action: 'appointment.due',
              // No customer details in notifications (the link opens the lead).
              title: 'Customer appointment today',
              detail: [timeOf(new Date(l.at)), l.note].filter(Boolean).join(' · '),
              href: `/sales/leads/${l.id}`,
              actorId: l.actorId,
              actorName: l.actorName,
            })),
          })),
        );
      }
      await tx.lead.update({ where: { id: l.id }, data: { appointmentRemindedAt: new Date() }, select: { id: true } });
    }
    return due.length;
  });
  publishNotifications(published);
  return reminded;
}

/** Runs the reminders now and every `everyMs` (default 10 minutes) while the server is up. */
export function startAppointmentReminders(everyMs = 10 * 60_000) {
  const run = () =>
    sendAppointmentReminders()
      .then((n) => n && logger.info(`Appointment reminders sent for ${n} lead(s)`))
      .catch((err) => logger.error({ err }, 'Appointment reminders failed'));
  const first = setTimeout(run, 15_000);
  const timer = setInterval(run, everyMs);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
