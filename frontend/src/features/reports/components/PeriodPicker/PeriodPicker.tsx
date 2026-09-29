import { Input, Select } from '@/shared/components/ui';
import { PERIOD_PRESETS, type PeriodPreset } from '../../lib/period';

export interface PeriodValue {
  preset: PeriodPreset;
  from: string;
  to: string;
}

/** Period presets, with free dates for "Custom". */
export function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (v: Partial<PeriodValue>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.preset} onChange={(e) => onChange({ preset: e.target.value as PeriodPreset })} className="w-auto" aria-label="Period">
        {PERIOD_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      {value.preset === 'custom' && (
        <>
          <Input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ from: e.target.value })} className="w-auto" aria-label="From" />
          <span className="text-sm text-slate-500">to</span>
          <Input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ to: e.target.value })} className="w-auto" aria-label="To" />
        </>
      )}
    </div>
  );
}
