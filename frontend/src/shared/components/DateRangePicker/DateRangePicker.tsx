import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib';

/** A calendar range in Pakistan dates (YYYY-MM-DD, inclusive). Empty = no limit. */
export interface DateRange {
  from?: string;
  to?: string;
}

export interface RangePreset {
  key: string;
  label: string;
  /** The range this preset stands for (evaluated when chosen). */
  range: () => DateRange;
}

export const karachiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
export const shiftDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86400_000).toISOString().slice(0, 10);
/** The last `n` days including today. */
export const lastDays = (n: number): DateRange => ({ from: shiftDays(karachiToday(), -(n - 1)), to: karachiToday() });

const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
/** "3 Sep – 9 Sep" for a custom range. */
export const rangeLabel = (r: DateRange) => (r.from && r.to ? (r.from === r.to ? short(r.from) : `${short(r.from)} – ${short(r.to)}`) : '');

/**
 * Quick ranges in one segmented row, plus "Custom" for any from / to dates (e.g. 5 or 6 days).
 * `value` is the chosen preset key, or 'custom' with its own dates.
 */
export function DateRangePicker({
  presets,
  value,
  custom,
  onChange,
  maxDays,
  className,
}: {
  presets: RangePreset[];
  value: string;
  custom?: DateRange;
  onChange: (key: string, range: DateRange) => void;
  /** Longest custom range allowed (inclusive days). */
  maxDays?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(custom?.from ?? '');
  const [to, setTo] = useState(custom?.to ?? '');
  const ref = useRef<HTMLDivElement>(null);
  const today = karachiToday();

  useEffect(() => {
    setFrom(custom?.from ?? '');
    setTo(custom?.to ?? '');
  }, [custom?.from, custom?.to]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const span = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1 : 0;
  const error = !from || !to ? '' : from > to ? 'The start date must be before the end date' : maxDays && span > maxDays ? `Choose at most ${maxDays} days` : '';

  const btn = (active: boolean) =>
    cn('shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition', active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900');

  return (
    <div ref={ref} className={cn('relative inline-block max-w-full', className)}>
      <div className="glass-soft scrollbar-thin inline-flex max-w-full overflow-x-auto rounded-xl p-1" role="group" aria-label="Date range">
        {presets.map((p) => (
          <button key={p.key} type="button" aria-pressed={value === p.key} className={btn(value === p.key)} onClick={() => onChange(p.key, p.range())}>
            {p.label}
          </button>
        ))}
        <button type="button" aria-pressed={value === 'custom'} aria-expanded={open} className={btn(value === 'custom')} onClick={() => setOpen((o) => !o)}>
          {value === 'custom' && custom ? rangeLabel(custom) : 'Custom'}
          <svg viewBox="0 0 16 16" className="ml-1.5 inline size-3.5 align-[-2px]" fill="none" aria-hidden>
            <path d="M3 4.5h10v9H3v-9Zm0 3h10M5.5 2.5v3m5-3v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="surface absolute left-0 z-30 mt-2 w-[min(20rem,calc(100vw-1.5rem))] p-4 sm:right-0 sm:left-auto" role="dialog" aria-label="Custom dates">
          <p className="mb-3 text-sm font-semibold text-slate-900">Custom dates</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              From
              <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-full rounded-lg border-0 bg-white px-2.5 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-500" />
            </label>
            <label className="text-xs font-medium text-slate-600">
              To
              <input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-full rounded-lg border-0 bg-white px-2.5 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-500" />
            </label>
          </div>
          <p className={cn('mt-2 min-h-5 text-xs', error ? 'text-red-600' : 'text-slate-500')}>{error || (span ? `${span} day${span === 1 ? '' : 's'}` : 'Pick a start and an end date')}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="button"
              disabled={!from || !to || !!error}
              onClick={() => {
                onChange('custom', { from, to });
                setOpen(false);
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
