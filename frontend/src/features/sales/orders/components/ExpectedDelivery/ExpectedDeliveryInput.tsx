import { Input } from '@/shared/components/ui';
import { cn, formatDate } from '@/shared/lib';

export interface ExpectedDeliveryValue {
  /** yyyy-mm-dd; a month is kept as its last day. Empty: not given. */
  date: string;
  byMonth: boolean;
}

/** The last day of a yyyy-mm month (an expected delivery "in December" is due by the 31st). */
const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** "December 2026" for a month, "15-Dec-2026" for a date, null when not given. */
export function formatExpectedDelivery(date: string | null | undefined, byMonth: boolean | null | undefined): string | null {
  if (!date) return null;
  return byMonth ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : formatDate(date);
}

/**
 * When the customer can expect the car: a month (some cars take 3–5 months, so usually just the
 * month) or an exact date.
 */
export function ExpectedDeliveryInput({ id, value, onChange, invalid }: { id: string; value: ExpectedDeliveryValue; onChange: (v: ExpectedDeliveryValue) => void; invalid?: boolean }) {
  const tab = (active: boolean) => cn('rounded-md px-2.5 py-1 text-xs font-medium transition', active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800');
  // Switching keeps the month of the chosen date.
  const switchTo = (byMonth: boolean) => {
    if (byMonth === value.byMonth) return;
    onChange({ byMonth, date: value.date && byMonth ? monthEnd(value.date.slice(0, 7)) : value.date });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Expected delivery as" className="inline-flex rounded-lg bg-slate-100 p-0.5">
        <button type="button" className={tab(value.byMonth)} aria-pressed={value.byMonth} onClick={() => switchTo(true)}>
          Month
        </button>
        <button type="button" className={tab(!value.byMonth)} aria-pressed={!value.byMonth} onClick={() => switchTo(false)}>
          Date
        </button>
      </div>
      {value.byMonth ? (
        <Input
          id={id}
          type="month"
          className="w-auto"
          invalid={invalid}
          value={value.date ? value.date.slice(0, 7) : ''}
          onChange={(e) => onChange({ byMonth: true, date: e.target.value ? monthEnd(e.target.value) : '' })}
        />
      ) : (
        <Input id={id} type="date" className="w-auto" invalid={invalid} value={value.date} onChange={(e) => onChange({ byMonth: false, date: e.target.value })} />
      )}
    </div>
  );
}
