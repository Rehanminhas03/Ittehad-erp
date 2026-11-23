import { Link, useNavigate } from 'react-router';
import { Button, PageHeader } from '@/shared/components/ui';
import { useAuth, usePermission } from '@/shared/hooks';
import { formatDate } from '@/shared/lib';
import { Panel, StatTile } from '../dashboard/components';
import { PpfCalendar, type PpfSlotDay } from './PpfCalendar';
import { P } from '../permissions';
import { useListPpfFormsQuery, useListPpfSlotsQuery } from '../salesApi';
import { bayStatusBadge } from '../documents/documentViews';

const todayPk = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

/** Where the PPF bay's own dashboard and a salesperson's "book a slot" panel get their days. */
export function usePpfBay(back = 0, days = 21) {
  const perm = usePermission();
  const dealers = [...perm.dealershipsFor(P.ppfSlots), ...perm.dealershipsFor(P.ppfCreate), ...perm.dealershipsFor(P.ppfViewAll), ...perm.dealershipsFor(P.ppfViewOwn)];
  const dealershipId = dealers[0]?.id ?? 0;
  return useListPpfSlotsQuery({ dealershipId, days, back }, { skip: !dealershipId, refetchOnMountOrArgChange: true });
}

/** A car in the bay (or booked): the day, the salesperson, the car, its numbers and the estimate date. */
function BayTable({ rows, empty, loading }: { rows: PpfSlotDay[]; empty: string; loading?: boolean }) {
  if (!rows.length) return <p className="px-1 py-3 text-sm text-slate-500">{loading ? 'Loading…' : empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
            <th className="py-1.5 pr-3 font-medium">Car comes</th>
            <th className="py-1.5 pr-3 font-medium">Car</th>
            <th className="py-1.5 pr-3 font-medium">Chassis no.</th>
            <th className="py-1.5 pr-3 font-medium">Engine no.</th>
            <th className="py-1.5 pr-3 font-medium">Customer</th>
            <th className="py-1.5 pr-3 font-medium">Salesperson</th>
            <th className="py-1.5 pr-3 font-medium">Dealership</th>
            <th className="py-1.5 pr-3 font-medium">Estimate date</th>
            <th className="py-1.5 font-medium">Voucher</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((d) => (
            <tr key={d.date}>
              <td className="py-1.5 pr-3 font-medium whitespace-nowrap text-slate-900">{dayLabel(d.date)}</td>
              <td className="py-1.5 pr-3 text-slate-700">{d.vehicle ?? '—'}</td>
              <td className="py-1.5 pr-3 font-mono text-xs">{d.chassisNo ?? '—'}</td>
              <td className="py-1.5 pr-3 font-mono text-xs">{d.engineNo ?? '—'}</td>
              <td className="py-1.5 pr-3">{d.customerName ?? '—'}</td>
              <td className="py-1.5 pr-3 text-slate-600">{d.salespersonName ?? d.bookedByName ?? '—'}</td>
              <td className="py-1.5 pr-3 text-slate-600">{d.dealershipName ?? '—'}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">{formatDate(d.estimateDate)}</td>
              <td className="py-1.5 font-mono text-xs">{d.formNo ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The PPF team's home page: the cars in the bay now, what is booked ahead and the free days. */
export function PpfDashboard() {
  const { user } = useAuth();
  const today = todayPk();
  const { data, isLoading } = usePpfBay(7, 28);
  const days = data?.days ?? [];
  const booked = days.filter((d) => d.booked && !d.blocked && !d.finishedOn);
  const inBay = booked.filter((d) => !!d.receivedOn);
  const ahead = booked.filter((d) => !d.receivedOn && d.date >= today);
  const free = days.filter((d) => !d.booked && d.date >= today);
  return (
    <div className="space-y-3">
      <PageHeader
        title={`Welcome back, ${user?.fullName.split(' ')[0] ?? ''}`}
        subtitle="The PPF bay: one car starts each day, shared by Hyundai, Jetour and CSM."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/sales/ppf-slots">
              <Button size="sm">Book a car / slots</Button>
            </Link>
            <Link to="/sales/ppf-forms/new">
              <Button size="sm" variant="secondary">
                New PPF voucher
              </Button>
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Cars in the bay now" value={inBay.length} icon="check" tone="blue" to="/sales/ppf-slots" hint="Received by the PPF team, not done yet" loading={isLoading} />
        <StatTile label="Booked ahead" value={ahead.length} icon="clock" tone="violet" to="/sales/ppf-slots" hint="From tomorrow, next 4 weeks" loading={isLoading} />
        <StatTile label="Free days" value={free.length} icon="check" tone="aqua" to="/sales/ppf-slots" hint="Next 4 weeks, Sundays off" loading={isLoading} />
        <StatTile label="Next free day" value={undefined} icon="clock" tone="orange" to="/sales/ppf-slots" hint={free[0] ? `${dayLabel(free[0].date)} · estimate ${formatDate(free[0].estimateDate)}` : '—'} loading={isLoading} />
      </div>
      <Panel title="The bay calendar" subtitle="Every day of the next 4 weeks: free, booked (with the car and who booked it) or in the bay" to="/sales/ppf-slots" toLabel="Book / cancel">
        <PpfCalendar days={days} details />
      </Panel>
      <Panel title="Cars in the bay now" subtitle="Received and being done: the salesperson, the car and its numbers" to="/sales/ppf-slots" toLabel="PPF slots">
        <BayTable rows={inBay} empty="No car is in the bay right now." loading={isLoading} />
      </Panel>
      <Panel title="Booked ahead" subtitle="Cars coming, by day" to="/sales/ppf-slots" toLabel="PPF slots">
        <BayTable rows={ahead} empty="Nothing is booked ahead." loading={isLoading} />
      </Panel>
      <Panel title="PPF cars and vouchers" subtitle="Every PPF car sold, with its salesperson, chassis and engine number" to="/sales/ppf-forms" toLabel="Open the list">
        <p className="px-1 py-2 text-sm text-slate-600">Open the list to search a car by chassis or engine number, or a customer, and to print the voucher.</p>
      </Panel>
    </div>
  );
}

/**
 * For salespeople (any sales dashboard): the next free PPF bay days and a button to book one by issuing a PPF voucher
 * (the day is picked on the voucher). Booked days are taken for every dealership.
 */
export function PpfBayPanel() {
  const navigate = useNavigate();
  const { data, isLoading } = usePpfBay(0, 14);
  const days = data?.days ?? [];
  // The salesperson's own PPF cars (the scope of the list is their own vouchers): booked, received or done.
  const mine = useListPpfFormsQuery({ pageSize: 6, sort: '-createdAt' });
  return (
    <Panel title="PPF bay: book a slot" subtitle="One car starts per day, shared by every dealership. Pick a free day on the PPF voucher; booked days are taken." to="/sales/ppf-slots" toLabel="All days">
      {isLoading && <span className="text-sm text-slate-500">Loading…</span>}
      <PpfCalendar days={days} compact onFree={() => navigate('/sales/ppf-forms/new')} />
      <div className="mt-2">
        <Link to="/sales/ppf-forms/new">
          <Button size="sm">Book a slot (new PPF voucher)</Button>
        </Link>
      </div>
      <h3 className="mt-3 mb-1 text-xs font-semibold tracking-wide text-slate-500">PPF cars: where each one is</h3>
      {!mine.data?.items.length ? (
        <p className="text-sm text-slate-500">{mine.isLoading ? 'Loading…' : 'No PPF voucher yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="py-1 pr-3 font-medium">Voucher</th>
                <th className="py-1 pr-3 font-medium">Customer</th>
                <th className="py-1 pr-3 font-medium">Car</th>
                <th className="py-1 pr-3 font-medium">Car comes</th>
                <th className="py-1 pr-3 font-medium">Estimate</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mine.data.items.map((f) => (
                <tr key={f.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/sales/ppf-forms/${f.id}`)}>
                  <td className="py-1 pr-3 font-mono text-xs">{f.formNo}</td>
                  <td className="py-1 pr-3">{f.customerName ?? '—'}</td>
                  <td className="py-1 pr-3 text-slate-600">{[f.modelName, f.variant].filter(Boolean).join(' ') || '—'}</td>
                  <td className="py-1 pr-3 whitespace-nowrap text-slate-600">{f.startDate ? formatDate(f.startDate) : '—'}</td>
                  <td className="py-1 pr-3 whitespace-nowrap text-slate-600">{f.installationDate ? formatDate(f.installationDate) : '—'}</td>
                  <td className="py-1">{bayStatusBadge(f.bayStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
