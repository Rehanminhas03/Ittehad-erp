import { Spinner } from '@/shared/components/ui';
import { formatDate } from '@/shared/lib';
import { useListPpfSlotsQuery } from '../salesApi';

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

/**
 * The PPF bay days from today: one car starts per day, shared by every dealership. A free day can be picked; a booked day
 * is greyed out. The estimate date of the picked day (4 working days after it) is shown under the days.
 */
export function PpfSlotPicker({ dealershipId, value, onChange, error }: { dealershipId: number; value: string; onChange: (date: string) => void; error?: string }) {
  const { data, isFetching } = useListPpfSlotsQuery({ dealershipId, days: 21 }, { skip: !dealershipId, refetchOnMountOrArgChange: true });
  const picked = data?.days.find((d) => d.date === value);
  return (
    <div>
      {isFetching && !data && <Spinner className="size-4 text-slate-400" />}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {(data?.days ?? []).map((d) => {
          const on = d.date === value;
          return (
            <button
              key={d.date}
              type="button"
              disabled={d.booked}
              onClick={() => onChange(on ? '' : d.date)}
              className={
                d.booked
                  ? 'cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-left text-xs text-slate-400'
                  : on
                    ? 'rounded-lg border border-brand-500 bg-brand-50 px-2 py-1.5 text-left text-xs font-semibold text-brand-800'
                    : 'rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-left text-xs text-slate-700 hover:border-brand-400'
              }
            >
              <span className="block font-medium">{dayLabel(d.date)}</span>
              <span className="block">{d.booked ? (d.mine ? 'Booked by you' : 'Booked') : on ? 'Selected' : 'Free'}</span>
            </button>
          );
        })}
      </div>
      {picked && (
        <p className="mt-1.5 text-xs text-slate-600">
          The car comes on <span className="font-semibold">{formatDate(picked.date)}</span>; the estimate date (delivery) is{' '}
          <span className="font-semibold">{formatDate(picked.estimateDate)}</span>.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
