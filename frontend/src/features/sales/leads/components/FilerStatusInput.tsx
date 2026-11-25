/** Tax filer status: an active filer, or an inactive one (non-filer). Two boxes, one ticked at a time; unticking clears it. */
export type FilerStatus = '' | 'active' | 'inactive';

export const FILER_LABELS: Record<string, string> = { active: 'Active (filer)', inactive: 'Inactive (non-filer)' };
export const filerLabel = (v: string | null | undefined) => (v ? (FILER_LABELS[v] ?? v) : null);

export function FilerStatusInput({ id, value, onChange, invalid }: { id: string; value: FilerStatus; onChange: (v: FilerStatus) => void; invalid?: boolean }) {
  const box = (v: 'active' | 'inactive', text: string) => (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
      <input type="checkbox" className="size-4 rounded border-slate-300" checked={value === v} onChange={(e) => onChange(e.target.checked ? v : '')} />
      {text}
    </label>
  );
  return (
    <div id={id} role="group" aria-label="Filer status" className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg px-1 py-2 ${invalid ? 'ring-2 ring-red-400' : ''}`}>
      {box('active', 'Active (filer)')}
      {box('inactive', 'Inactive (non-filer)')}
    </div>
  );
}
