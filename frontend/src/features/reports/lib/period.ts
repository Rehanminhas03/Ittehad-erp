export type PeriodPreset = 'this_month' | 'last_month' | 'last_90' | 'this_year' | 'custom';

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom…' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The from/to dates (inclusive, local calendar) of a preset, relative to `today`. */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case 'this_month':
      return { from: iso(new Date(y, m, 1)), to: iso(today) };
    case 'last_month':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'last_90':
      return { from: iso(new Date(y, m, today.getDate() - 89)), to: iso(today) };
    case 'this_year':
      return { from: iso(new Date(y, 0, 1)), to: iso(today) };
  }
}
