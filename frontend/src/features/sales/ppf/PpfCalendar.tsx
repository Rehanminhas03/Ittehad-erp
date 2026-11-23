import type { ReactNode } from 'react';
import { cn, formatDate } from '@/shared/lib';
import type { PpfSlots } from '../salesApi';

export type PpfSlotDay = PpfSlots['days'][number];

const todayPk = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const dt = (iso: string) => new Date(`${iso}T00:00:00`);
const monday = (iso: string) => {
  const d = dt(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** yyyy-mm-dd plus n days, by the calendar (not by UTC, which shifted every card by a day east of Greenwich). */
const plusDays = (iso: string, n: number) => {
  const d = dt(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const weekRange = (mon: string) => {
  const a = dt(mon);
  const b = new Date(a);
  b.setDate(b.getDate() + 5);
  const f = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${f(a)} – ${f(b)}`;
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The PPF bay as a week-by-week calendar of slot cards (Sunday is off). Free days are green and show when the car would be
 * ready; booked days are shaded (with the car, customer and salesperson where the viewer may see them); today is ringed and a
 * car still in the bay is blue. `onFree` makes the free days clickable.
 */
export function PpfCalendar({
  days,
  details = false,
  compact = false,
  selected,
  onFree,
  allowPast = false,
  onCancelExtra,
  onBooked,
  actions,
}: {
  days: PpfSlotDay[];
  /** Show the car / customer / salesperson on booked days (the PPF team and a salesperson's own bookings). */
  details?: boolean;
  compact?: boolean;
  selected?: string;
  onFree?: (date: string) => void;
  /** The PPF team may open an earlier day too (a car started early). */
  allowPast?: boolean;
  /** Cancel an extra car on a day (the PPF team). */
  onCancelExtra?: (bookingId: number) => void;
  /** Click a booked or closed day to open it (the PPF team). */
  onBooked?: (day: PpfSlotDay) => void;
  /** Extra controls on a card (e.g. Cancel on a booked day). */
  actions?: (d: PpfSlotDay) => ReactNode;
}) {
  const today = todayPk();
  const weeks = new Map<string, Map<string, PpfSlotDay>>();
  for (const d of days) {
    const m = monday(d.date);
    if (!weeks.has(m)) weeks.set(m, new Map());
    weeks.get(m)!.set(d.date, d);
  }
  return (
    <div className="space-y-3">
      {[...weeks.entries()].map(([mon, byDate]) => {
        const cells = WEEKDAYS.map((_, i) => {
          const iso = plusDays(mon, i);
          return { iso, day: byDate.get(iso) };
        });
        return (
          <div key={mon}>
            <p className="mb-1 text-xs font-medium tracking-wide text-slate-500">Week of {weekRange(mon)}</p>
            <div className={cn('grid gap-1.5', compact ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6')}>
              {cells.map(({ iso, day }, i) => {
                const label = (
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-medium tracking-wide text-slate-500">{WEEKDAYS[i]}</span>
                    <span className="text-lg leading-none font-semibold text-slate-900">{dt(iso).getDate()}</span>
                  </div>
                );
                if (!day) return <div key={iso} className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-2 opacity-60">{label}</div>;
                // In the bay: the PPF team has received the car and the work is not done yet.
                const inBay = day.booked && !day.blocked && !!day.receivedOn && !day.finishedOn;
                const past = day.date < today && !inBay && !(allowPast && !day.booked);
                const isToday = day.date === today;
                const base = 'flex min-h-20 flex-col rounded-xl border p-2 text-left transition';
                const tone = day.blocked
                  ? 'border-slate-300 bg-slate-200/70'
                  : day.finishedOn
                    ? 'border-emerald-300 bg-emerald-100/60'
                    : day.booked
                  ? inBay
                    ? 'border-blue-200 bg-blue-50'
                    : day.mine
                      ? 'border-violet-200 bg-violet-50'
                      : 'border-slate-200 bg-slate-100'
                  : selected === day.date
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-300'
                    : 'border-emerald-200 bg-emerald-50/70';
                const body = (
                  <>
                    {label}
                    <div className="mt-1.5 flex-1">
                      {day.blocked ? (
                        <span className="inline-block rounded-full bg-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">Closed</span>
                      ) : day.booked ? (
                        <>
                          <span className={cn('inline-block rounded-full px-1.5 py-0.5 text-[11px] font-medium', day.finishedOn ? 'bg-emerald-200 text-emerald-900' : inBay ? 'bg-blue-100 text-blue-800' : day.mine ? 'bg-violet-100 text-violet-800' : 'bg-slate-200 text-slate-600')}>
                            {day.finishedOn ? `Done ${formatDate(day.finishedOn)}` : inBay ? `Received ${formatDate(day.receivedOn!)}` : day.mine ? 'Booked by you' : 'Booked'}
                          </span>
                          {(details || day.mine) && (
                            <div className="mt-1 space-y-0.5 text-xs text-slate-700">
                              {day.vehicle && <p className="font-medium">{day.vehicle}</p>}
                              {day.customerName && <p className="text-slate-600">{day.customerName}</p>}
                              {!compact && day.salespersonName && <p className="text-slate-500">By {day.salespersonName}{day.dealershipName ? ` · ${day.dealershipName}` : ''}</p>}
                              {!compact && day.registrationNo && <p className="text-slate-500">Reg {day.registrationNo}</p>}
                              {!compact && day.amount && <p className="text-slate-500">PKR {Number(day.amount).toLocaleString('en-GB')}</p>}
                              {!compact && (day.chassisNo || day.engineNo) && (
                                <p className="font-mono text-[10px] text-slate-500">
                                  {day.chassisNo ? `Ch ${day.chassisNo}` : ''}
                                  {day.chassisNo && day.engineNo ? ' · ' : ''}
                                  {day.engineNo ? `En ${day.engineNo}` : ''}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="inline-block rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">{onFree ? (selected === day.date ? 'Selected' : day.date < today ? 'Open earlier day' : 'Free · book') : 'Free'}</span>
                        </>
                      )}
                    </div>
                    {day.extras.map((x) => (
                      <div key={x.bookingId} className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[11px] text-slate-700">
                        <p className="font-medium">+ {x.customerName}</p>
                        {x.vehicle && <p>{x.vehicle}</p>}
                        {(x.registrationNo || x.chassisNo || x.engineNo) && <p className="font-mono text-[10px] text-slate-500">{[x.registrationNo && `Reg ${x.registrationNo}`, x.chassisNo && `Ch ${x.chassisNo}`, x.engineNo && `En ${x.engineNo}`].filter(Boolean).join(' · ')}</p>}
                        {(x.salespersonName || x.amount) && <p className="text-slate-500">{[x.salespersonName && `By ${x.salespersonName}`, x.amount && `PKR ${Number(x.amount).toLocaleString('en-GB')}`].filter(Boolean).join(' · ')}</p>}
                        {onCancelExtra && (
                          <button type="button" className="text-[10px] font-medium text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); onCancelExtra(x.bookingId); }}>
                            Cancel extra car
                          </button>
                        )}
                      </div>
                    ))}
                    {!day.blocked && <p className="mt-1 text-[11px] text-slate-500">{day.finishedOn ? 'Done' : 'Ready'} {formatDate(day.finishedOn ?? day.estimateDate)}</p>}
                    {actions?.(day)}
                  </>
                );
                const ring = isToday ? ' ring-2 ring-brand-500' : '';
                if (!day.booked && onFree && !past) {
                  return (
                    <button key={iso} type="button" onClick={() => onFree(day.date)} className={cn(base, tone, 'cursor-pointer hover:border-brand-400 hover:shadow-sm', ring)}>
                      {body}
                    </button>
                  );
                }
                const openable = !!onBooked && day.booked && !!day.bookingId;
                return (
                  <div
                    key={iso}
                    className={cn(base, tone, past && 'opacity-60', ring, openable && 'cursor-pointer hover:shadow-sm')}
                    role={openable ? 'button' : undefined}
                    tabIndex={openable ? 0 : undefined}
                    onClick={openable ? () => onBooked!(day) : undefined}
                    onKeyDown={openable ? (e) => e.key === 'Enter' && onBooked!(day) : undefined}
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><i className="size-2.5 rounded bg-emerald-200" /> Free</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded bg-slate-300" /> Booked</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded bg-blue-200" /> Received (in the bay)</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded bg-emerald-300" /> Done</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded bg-slate-400" /> Closed</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded bg-violet-200" /> Booked by you</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded ring-2 ring-brand-500" /> Today</span>
      </div>
    </div>
  );
}
