import { Link } from 'react-router';
import { Badge, Spinner } from '@/shared/components/ui';
import { formatDate } from '@/shared/lib';
import { CLEARANCE_LABELS } from '../permissions';
import { type SalesToday, useGetSalesTodayQuery } from '../salesApi';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit', hour12: true });

type Appt = SalesToday['appointmentsToday'][number];
type Deliv = SalesToday['deliveriesToday'][number];

function Appointments({ title, rows, empty }: { title: string; rows: Appt[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        {title} <Badge tone={rows.length ? 'amber' : 'gray'}>{rows.length}</Badge>
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((a) => (
            <li key={a.leadId}>
              <Link to={`/sales/leads/${a.leadId}`} className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 text-sm hover:bg-white/70">
                <span className="w-16 shrink-0 font-semibold tabular-nums text-brand-700">{time(a.at)}</span>
                <span className="font-medium text-slate-900">{a.customerName}</span>
                {a.note && <span className="text-slate-600">· {a.note}</span>}
                {a.salespersonName && <span className="text-xs text-slate-500">· {a.salespersonName}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Deliveries({ title, rows, empty, today }: { title: string; rows: Deliv[]; empty: string; today?: string }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        {title} <Badge tone={rows.length ? 'blue' : 'gray'}>{rows.length}</Badge>
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((d) => {
            const c = CLEARANCE_LABELS[d.clearanceStatus] ?? CLEARANCE_LABELS.none!;
            return (
              <li key={d.deliveryId}>
                <Link to={`/sales/orders/${d.orderId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1 text-sm hover:bg-white/70">
                  <span className="font-medium text-slate-900">{d.customerName ?? '—'}</span>
                  <span className="text-slate-600">· {d.model ?? ''}</span>
                  {today && d.scheduledDate < today && <Badge tone="red">Overdue ({formatDate(d.scheduledDate)})</Badge>}
                  <Badge tone={c.tone}>{c.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Today at a glance (top of the dashboard): customer appointments and car deliveries for today and
 * tomorrow, so the Manager / Assistant Manager see the day in the morning. Each row opens the lead or order.
 */
export function TodayPanel() {
  const { data, isLoading } = useGetSalesTodayQuery({}, { pollingInterval: 5 * 60_000 });
  if (isLoading || !data) {
    return (
      <div className="surface flex justify-center p-5">
        <Spinner className="size-5 text-slate-400" />
      </div>
    );
  }
  return (
    <section className="surface p-5" aria-label="Today at a glance">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Today at a glance</h2>
        <span className="text-sm text-slate-500">{new Date(`${data.today}T12:00:00+05:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Appointments title="Appointments today" rows={data.appointmentsToday} empty="No appointments today." />
        <Deliveries title="Deliveries today" rows={data.deliveriesToday} empty="No deliveries today." today={data.today} />
        <Appointments title="Appointments tomorrow" rows={data.appointmentsTomorrow} empty="None yet for tomorrow." />
        <Deliveries title="Deliveries tomorrow" rows={data.deliveriesTomorrow} empty="None yet for tomorrow." />
      </div>
    </section>
  );
}
