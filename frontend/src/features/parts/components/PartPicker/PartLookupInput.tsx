import { useEffect, useRef, useState } from 'react';
import { Input, Spinner } from '@/shared/components/ui';
import { formatMoney } from '@/shared/lib';
import { type Part, useListPartsQuery } from '../../partsApi';

/**
 * A text box for a part number or a part name that suggests the catalogue's parts as it is typed: choosing one fills
 * the whole line (number, name, type, cost). What is typed stays editable, so a changed number or a part not in the
 * catalogue can still be written by hand.
 */
export function PartLookupInput({ value, onChange, onPick, className, placeholder, label }: { value: string; onChange: (v: string) => void; onPick: (p: Part) => void; className?: string; placeholder?: string; label: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value]);
  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const { data, isFetching } = useListPartsQuery({ q, pageSize: 8, isActive: 'true', sort: 'partNo' }, { skip: q.length < 2 || !open });
  const items = data?.items ?? [];

  return (
    <div ref={box} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className={className}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
      />
      {open && isFetching && <Spinner className="absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-slate-400" />}
      {open && q.length >= 2 && items.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-[26rem] max-w-[80vw] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox">
          {items.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50"
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-slate-900">{p.partNo}</span>
                  <span className="block truncate text-slate-600">{p.description}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">{p.purchasePrice ? formatMoney(p.purchasePrice) : formatMoney(p.sellingPrice)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
