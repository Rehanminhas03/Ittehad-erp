import { Link } from 'react-router';
import { Section, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { formatDate } from '@/shared/lib';
import { useListAppointmentsQuery, useListServicesDueQuery } from '../../serviceApi';
import { P } from '../../permissions';

const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

/**
 * The customer call list on the home page of the CRO (and the service advisor): how many cars are due for their service,
 * who to call first, and the appointments booked from the calls, with links to the full call list and the appointments.
 */
export function ServiceCallPanel() {
  const perm = usePermission();
  const allowed = perm.can(P.remindersView);
  const due = useListServicesDueQuery({ days: 7 }, { skip: !allowed });
  const appts = useListAppointmentsQuery({}, { skip: !allowed });
  if (!allowed) return null;

  const today = iso(new Date());
  const items = due.data?.items ?? [];
  const uncalled = items.filter((i) => !i.lastCall).length;
  const booked = appts.data ?? [];
  const todays = booked.filter((a) => a.date === today);
  const next = items.filter((i) => !i.lastCall || i.lastCall.outcome !== 'booked').slice(0, 5);

  const stats: { label: string; value: number | undefined; to: string; tone: string }[] = [
    { label: 'Overdue services', value: due.data?.overdue, to: '/service/reminders', tone: 'bg-red-50 text-red-900 ring-red-200' },
    { label: 'Due this week', value: due.data?.total, to: '/service/reminders', tone: 'bg-amber-50 text-amber-900 ring-amber-200' },
    { label: 'Not called yet', value: uncalled, to: '/service/reminders', tone: 'bg-sky-50 text-sky-900 ring-sky-200' },
    { label: 'Appointments today', value: todays.length, to: '/service/appointments', tone: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
  ];

  return (
    <Section
      className="mb-0 p-3 sm:p-4"
      title="Service calls and appointments"
      actions={
        <span className="flex items-center gap-3 text-sm">
          <Link to="/service/reminders" className="font-medium text-brand-700 hover:underline">
            Open the call list
          </Link>
          <Link to="/service/appointments" className="font-medium text-brand-700 hover:underline">
            Appointments
          </Link>
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className={`rounded-xl px-3 py-2 ring-1 ${s.tone}`}>
            <p className="text-xs font-medium opacity-80">{s.label}</p>
            <p className="text-xl leading-tight font-semibold tabular-nums">{due.isLoading || appts.isLoading ? <Spinner className="size-4" /> : (s.value ?? 0)}</p>
          </Link>
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Call next</p>
          {next.length === 0 ? (
            <p className="text-sm text-slate-500">No one is waiting for a call.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {next.map((r) => (
                <li key={r.scheduleId} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900">{r.customerName}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.service} · {r.registrationNo ?? 'Unregistered'} · due {formatDate(r.dueDate)}
                      {r.overdue ? ' (overdue)' : ''}
                    </span>
                  </span>
                  <a href={`tel:${r.mobile}`} className="shrink-0 text-xs font-medium text-brand-700 hover:underline">
                    {r.mobile}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Next appointments</p>
          {booked.length === 0 ? (
            <p className="text-sm text-slate-500">No appointments booked.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {booked.slice(0, 5).map((a) => (
                <li key={a.scheduleId} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900">{a.customerName}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {a.service} · {a.registrationNo ?? 'Unregistered'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-700">
                    {a.date === today ? 'Today' : formatDate(a.date)}
                    {a.time ? ` · ${a.time}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}
