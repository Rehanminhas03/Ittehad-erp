import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Input, PageHeader, Spinner } from '@/shared/components/ui';
import { formatDate } from '@/shared/lib';
import { useListAppointmentsQuery } from '../../serviceApi';

const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const plus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};

/**
 * The appointments the CRO booked from the call list, by day: who is coming in, with which car and for which service,
 * so the service advisors can prepare. Today and the next 30 days to begin with.
 */
export default function AppointmentsPage() {
  const [from, setFrom] = useState(plus(0));
  const [to, setTo] = useState(plus(30));
  const { data, isFetching, isError } = useListAppointmentsQuery({ from, to });
  const today = plus(0);
  const tomorrow = plus(1);
  const days = [...new Set((data ?? []).map((a) => a.date))];
  const heading = (d: string) => (d === today ? `Today · ${formatDate(d)}` : d === tomorrow ? `Tomorrow · ${formatDate(d)}` : formatDate(d));

  return (
    <div>
      <PageHeader title="Appointments" subtitle="Customers the CRO booked from the call list. When the customer comes in, the visit closes the service on the call list by itself." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1.5">
          <Button size="sm" variant={from === plus(0) && to === plus(0) ? 'primary' : 'secondary'} onClick={() => (setFrom(plus(0)), setTo(plus(0)))}>
            Today
          </Button>
          <Button size="sm" variant={from === plus(1) && to === plus(1) ? 'primary' : 'secondary'} onClick={() => (setFrom(plus(1)), setTo(plus(1)))}>
            Tomorrow
          </Button>
          <Button size="sm" variant={from === plus(0) && to === plus(7) ? 'primary' : 'secondary'} onClick={() => (setFrom(plus(0)), setTo(plus(7)))}>
            Next 7 days
          </Button>
          <Button size="sm" variant={from === plus(0) && to === plus(30) ? 'primary' : 'secondary'} onClick={() => (setFrom(plus(0)), setTo(plus(30)))}>
            Next 30 days
          </Button>
        </div>
        <label className="text-xs text-slate-500">
          From
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="mt-0.5 w-40" />
        </label>
        <label className="text-xs text-slate-500">
          To
          <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="mt-0.5 w-40" />
        </label>
      </div>
      {isFetching && <Spinner className="my-6 size-5 text-slate-400" />}
      {isError && <p className="text-sm text-red-600">The appointments could not be loaded.</p>}
      {!isFetching && !isError && days.length === 0 && <p className="py-8 text-sm text-slate-500">No appointments booked for these days.</p>}
      <div className="space-y-5">
        {days.map((d) => (
          <section key={d} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{heading(d)}</h2>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 pr-3 font-medium">Time</th>
                  <th className="py-1 pr-3 font-medium">Customer</th>
                  <th className="py-1 pr-3 font-medium">Car</th>
                  <th className="py-1 pr-3 font-medium">Service</th>
                  <th className="py-1 pr-3 font-medium">Booked by</th>
                  <th className="py-1 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data ?? [])
                  .filter((a) => a.date === d)
                  .map((a) => (
                    <tr key={a.scheduleId}>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{a.time ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <span className="font-medium text-slate-900">{a.customerName}</span>
                        <a href={`tel:${a.mobile}`} className="block text-xs text-brand-700 hover:underline">
                          {a.mobile}
                        </a>
                      </td>
                      <td className="py-2 pr-3">
                        <Link to={`/crm/vehicles/${a.vehicleId}`} className="hover:text-brand-700">
                          {a.registrationNo ?? 'Unregistered'}
                        </Link>
                        <span className="block text-xs text-slate-500">{a.modelName}</span>
                      </td>
                      <td className="py-2 pr-3">{a.service}</td>
                      <td className="py-2 pr-3 text-slate-600">{a.bookedBy ?? '—'}</td>
                      <td className="py-2 text-slate-600">{a.remarks ?? ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
